import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { NextResponse } from 'next/server'
import { formatNaskahForSheetsExport } from '@/lib/sheets-helpers'
import { getValidAccessToken } from '@/lib/cakgpt/google-oauth'
import { pushValuesToGoogleSheet } from '@/lib/cakgpt/google-sheets'
import { parseGoogleDocId } from '@/lib/cakgpt/google-docs'

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

  const { naskah_ids, batch_id, google_sheet_url } = body
  let targetIds = Array.isArray(naskah_ids) && naskah_ids.length > 0 ? naskah_ids : []

  // Check if batch has linked external_doc_ref
  let linkedSheetId: string | null = null
  if (batch_id) {
    const { data: batch } = await supabase
      .from('sw_batches')
      .select('id, external_doc_ref')
      .eq('id', batch_id)
      .maybeSingle()

    if (batch?.external_doc_ref?.doc_id && batch.external_doc_ref.doc_url?.includes('/spreadsheets/')) {
      linkedSheetId = batch.external_doc_ref.doc_id
    }
  }

  if (google_sheet_url) {
    const parsedId = parseGoogleDocId(google_sheet_url)
    if (parsedId) linkedSheetId = parsedId
  }

  if (targetIds.length === 0 && batch_id) {
    const { data: bItems } = await supabase.from('sw_naskah').select('id').eq('batch_id', batch_id)
    if (bItems) targetIds = bItems.map(i => i.id)
  }

  if (targetIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'naskah_ids or batch_id required' }, { status: 400 })
  }

  // 1. Fetch sw_naskah without sw_naskah_versions relation (avoids PostgREST ambiguity)
  let { data: naskahRows } = await supabase
    .from('sw_naskah')
    .select('id, title, status, day_no, brief_id, persona_id, sw_personas(id, name)')
    .in('id', targetIds)

  if (!naskahRows || naskahRows.length === 0) {
    const { data: legacyRows } = await supabase
      .from('naskah')
      .select('id, title, status, day_no, brief_id, persona_id, personas(id, name)')
      .in('id', targetIds)

    naskahRows = (legacyRows || []).map((l: any) => ({
      ...l,
      sw_personas: l.personas,
    }))
  }

  if (!naskahRows || naskahRows.length === 0) {
    return NextResponse.json({ ok: false, error: 'No naskah found for export' }, { status: 404 })
  }

  // 2. Fetch versions separately using explicit naskah_id query
  const nIds = naskahRows.map(n => n.id)
  const { data: swVer } = await supabase
    .from('sw_naskah_versions')
    .select('id, naskah_id, body, is_current')
    .in('naskah_id', nIds)

  const { data: legacyVer } = await supabase
    .from('naskah_versions')
    .select('id, naskah_id, body, is_current')
    .in('naskah_id', nIds)

  const allVersions = [...(swVer || []), ...(legacyVer || [])]
  const versionMap = new Map<string, any>()
  for (const v of allVersions) {
    if (v.is_current || !versionMap.has(v.naskah_id)) {
      versionMap.set(v.naskah_id, v)
    }
  }

  const formattedList = naskahRows.map(n => {
    const persona = Array.isArray(n.sw_personas) ? n.sw_personas[0] : n.sw_personas
    const currentVer = versionMap.get(n.id)

    return {
      id: n.id,
      title: n.title,
      persona_name: persona?.name || 'Subject',
      day_series: n.title?.match(/Hari \d+(?:\/\d+)?/i)?.[0] || (n.day_no ? `Hari ${n.day_no}` : 'Hari 1/3'),
      body: currentVer?.body || [],
    }
  })

  const sheetsData = formatNaskahForSheetsExport(formattedList)

  // Direct Push via Google Sheets API if linkedSheetId is present and Google account is connected
  let directPushed = false
  let sheetUrl: string | null = null

  if (linkedSheetId) {
    try {
      const service = createServiceClient()
      const accessToken = await getValidAccessToken(service, user.id)

      // Build header row + data rows
      const tableRows = [
        ['No', 'Judul / Topik', 'Persona', 'Hari / Seri', 'Hook (Kalimat Utama)', 'Isi Script / Body', 'Call To Action (CTA)', 'Visual & Direction Notes', 'Status Klien', 'Komentar Klien', 'Naskah ID'],
        ...sheetsData.map(row => [
          row.no,
          row.topic,
          row.persona,
          row.day_series,
          row.hook_text,
          row.body_text,
          row.cta_text,
          row.visual_notes,
          row.client_status,
          row.client_comment,
          row.naskah_id,
        ]),
      ]

      await pushValuesToGoogleSheet(accessToken, linkedSheetId, tableRows)
      directPushed = true
      sheetUrl = `https://docs.google.com/spreadsheets/d/${linkedSheetId}/edit`
    } catch (e) {
      console.warn('Direct Google Sheet push failed, falling back to clipboard format:', e)
    }
  }

  return NextResponse.json({
    ok: true,
    count: sheetsData.length,
    rows: sheetsData,
    direct_pushed: directPushed,
    sheet_url: sheetUrl,
    exported_at: new Date().toISOString(),
  })
}
