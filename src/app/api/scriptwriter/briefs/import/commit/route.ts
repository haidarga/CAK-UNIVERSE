import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { ImportCommitSchema } from '@/lib/cakgpt/schemas'

// POST /api/briefs/import/commit — bulk-insert the reviewed briefs. Returns the
// created brief ids so the caller can immediately fan them out into naskah via
// /api/batches/[id]/generate (the "content plan → naskah per persona" flow).
export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let json: unknown
  try { json = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const parsed = ImportCommitSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid payload: expected { briefs: [...], client_id?, status? }' }, { status: 400 })
  const { briefs, status } = parsed.data

  // Verify the client belongs to this user before attaching it to every brief.
  let clientId: string | null = null
  if (parsed.data.client_id) {
    const { data: client } = await supabase
      .from('sw_clients').select('id').eq('id', parsed.data.client_id).eq('created_by', user.id).eq('is_active', true).maybeSingle()
    if (!client) return NextResponse.json({ ok: false, error: 'client not found' }, { status: 400 })
    clientId = client.id
  }

  const importGroup = parsed.data.import_label?.trim() || null
  const rows = briefs.map((b) => ({
    created_by: user.id,
    title: b.title,
    product: b.product ?? null,
    platform: b.platform ?? null,
    client_id: clientId,
    fields: b.fields ?? {},
    status,
    import_group: importGroup,
  }))

  const { data, error } = await supabase.from('sw_strategist_briefs').insert(rows).select('id')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, brief_ids: (data || []).map((r) => r.id), count: data?.length || 0 })
}
