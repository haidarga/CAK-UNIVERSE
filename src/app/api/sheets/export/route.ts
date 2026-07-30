import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { NextResponse } from 'next/server'
import { formatNaskahForSheetsExport } from '@/lib/sheets-helpers'

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { naskah_ids, batch_id } = body

  let query = supabase.from('sw_naskah').select(`
    id, title, status, day_no, brief_id, persona_id,
    sw_personas(id, name),
    sw_naskah_versions(id, body, is_current)
  `)

  if (Array.isArray(naskah_ids) && naskah_ids.length > 0) {
    query = query.in('id', naskah_ids)
  } else if (batch_id) {
    query = query.eq('batch_id', batch_id)
  } else {
    return NextResponse.json({ ok: false, error: 'naskah_ids or batch_id required' }, { status: 400 })
  }

  const { data: naskahRows, error } = await query
  if (error || !naskahRows) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to fetch naskah' }, { status: 500 })
  }

  const formattedList = naskahRows.map(n => {
    const persona = Array.isArray(n.sw_personas) ? n.sw_personas[0] : n.sw_personas
    const currentVer = Array.isArray(n.sw_naskah_versions)
      ? n.sw_naskah_versions.find((v: any) => v.is_current) || n.sw_naskah_versions[0]
      : n.sw_naskah_versions

    return {
      id: n.id,
      title: n.title,
      persona_name: persona?.name || 'Subject',
      day_series: n.title?.match(/Hari \d+(?:\/\d+)?/i)?.[0] || (n.day_no ? `Hari ${n.day_no}` : 'Hari 1/3'),
      body: currentVer?.body || [],
    }
  })

  const sheetsData = formatNaskahForSheetsExport(formattedList)

  return NextResponse.json({
    ok: true,
    count: sheetsData.length,
    rows: sheetsData,
    exported_at: new Date().toISOString(),
  })
}
