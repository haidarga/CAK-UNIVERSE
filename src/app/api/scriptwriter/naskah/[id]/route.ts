import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const { data: naskah, error } = await supabase
    .from('sw_naskah')
    .select('*, current_version:sw_naskah_versions!sw_naskah_current_version_id_fkey(*)')
    .eq('id', id).eq('created_by', user.id).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!naskah) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })

  const versionId = naskah.current_version_id
  const { data: flags } = versionId
    ? await supabase.from('sw_qc_flags').select('*').eq('naskah_version_id', versionId).order('created_at', { ascending: true })
    : { data: [] }

  return NextResponse.json({ ok: true, naskah, flags: flags || [] })
}
