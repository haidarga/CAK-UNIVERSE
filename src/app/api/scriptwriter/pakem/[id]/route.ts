import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { PakemStructureSchema } from '@/lib/cakgpt/script-pakem'
import { z } from 'zod'

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  structure: PakemStructureSchema.optional(),
  is_default: z.boolean().optional(),
  source_excerpt: z.string().max(20_000).nullable().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let json: unknown
  try { json = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const parsed = PatchSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) patch.name = parsed.data.name.trim()
  if (parsed.data.structure !== undefined) patch.structure = parsed.data.structure
  if (parsed.data.source_excerpt !== undefined) patch.source_excerpt = parsed.data.source_excerpt
  // Set BEFORE the emptiness check: toggling only the default is a valid patch
  // on its own, and the star button in the list sends exactly that.
  if (parsed.data.is_default !== undefined) patch.is_default = parsed.data.is_default
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'no valid fields to update' }, { status: 400 })
  }

  // Only one default per client. Cleared BEFORE the update so a failed write
  // cannot leave the brand with two defaults (or none, if it ran after).
  if (parsed.data.is_default === true) {
    const { data: row } = await supabase
      .from('sw_script_pakem').select('client_id').eq('id', id).eq('created_by', user.id).maybeSingle()
    if (row?.client_id) {
      await supabase.from('sw_script_pakem')
        .update({ is_default: false })
        .eq('client_id', row.client_id).eq('created_by', user.id).neq('id', id)
    }
  }

  const { data, error } = await supabase
    .from('sw_script_pakem').update(patch)
    .eq('id', id).eq('created_by', user.id)
    .select('id, client_id, name, structure, source_excerpt, is_default, created_at').maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true, pakem: data })
}

// Soft-delete, matching how clients and personas are removed: queued jobs and
// finished naskah reference this row, so a hard delete would either be blocked
// or would rewrite history.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const { error } = await supabase
    .from('sw_script_pakem').update({ is_active: false }).eq('id', id).eq('created_by', user.id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
