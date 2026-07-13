import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'

// Writer disposition on a flag — the raw signal the PRD's precision metric
// reads: resolved (writer agreed, fixed it) vs dismissed (writer disagreed,
// flag was noise). RLS scopes this through qc_flags' naskah-ownership policy.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  if (body.status !== 'resolved' && body.status !== 'dismissed') {
    return NextResponse.json({ ok: false, error: 'status must be "resolved" or "dismissed"' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('sw_qc_flags')
    .update({ status: body.status, resolved_by: user.id, resolved_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true, flag: data })
}
