import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'

// PATCH /api/clients/[id] — edit a client (name/notes) or soft-delete it
// (is_active=false). No hard delete: briefs/batches FK to clients with
// ON DELETE RESTRICT, and there's no delete RLS policy — soft-disable is the
// removal path (the client just disappears from the active list).
const PATCHABLE_FIELDS = ['name', 'notes', 'is_active'] as const

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  for (const field of PATCHABLE_FIELDS) if (field in body) patch[field] = body[field]
  if (typeof patch.name === 'string' && !patch.name.trim()) return NextResponse.json({ ok: false, error: 'name cannot be empty' }, { status: 400 })
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: 'no valid fields to update' }, { status: 400 })

  const { data, error } = await supabase
    .from('sw_clients').update(patch).eq('id', id).eq('created_by', user.id).select('*').maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true, client: data })
}
