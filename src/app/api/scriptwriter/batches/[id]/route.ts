import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const { data, error } = await supabase.from('sw_batches').select('*').eq('id', id).eq('created_by', user.id).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true, batch: data })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string') patch.name = body.name
  if (body.status === 'closed') { patch.status = 'closed'; patch.closed_at = new Date().toISOString() }
  else if (body.status === 'open') { patch.status = 'open'; patch.closed_at = null }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: 'no valid fields to update' }, { status: 400 })

  const { data, error } = await supabase.from('sw_batches').update(patch).eq('id', id).eq('created_by', user.id).select('*').maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true, batch: data })
}

// DELETE /api/batches/[id] — hard-delete a batch and everything under it (its
// naskah → cascades naskah_versions + qc_flags; its gen_jobs cascade on the
// batch delete). Uses the service client because there's no delete RLS policy
// (append-only default) — but only after verifying ownership, and every delete
// is still scoped by created_by as defense-in-depth.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authClient = await createServerClient()
  const { user, unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  const { data: batch } = await authClient.from('sw_batches').select('id').eq('id', id).eq('created_by', user.id).maybeSingle()
  if (!batch) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })

  const service = createServiceClient()
  // Naskah first (cascades their versions + flags), then the batch (cascades gen_jobs).
  const { error: nErr } = await service.from('sw_naskah').delete().eq('batch_id', id).eq('created_by', user.id)
  if (nErr) return NextResponse.json({ ok: false, error: nErr.message }, { status: 500 })
  const { error: bErr } = await service.from('sw_batches').delete().eq('id', id).eq('created_by', user.id)
  if (bErr) return NextResponse.json({ ok: false, error: bErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
