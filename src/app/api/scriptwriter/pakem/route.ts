import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { PakemStructureSchema } from '@/lib/cakgpt/script-pakem'
import { z } from 'zod'

// Script Pakem CRUD, scoped to one client. Owner-filtered explicitly on every
// query rather than leaning on RLS alone — same defense-in-depth as the rest of
// the scriptwriter routes.

// GET /api/scriptwriter/pakem?client_id=...
export async function GET(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const clientId = new URL(req.url).searchParams.get('client_id')
  if (!clientId) return NextResponse.json({ ok: false, error: 'client_id is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('sw_script_pakem')
    .select('id, client_id, name, structure, source_excerpt, created_at')
    .eq('client_id', clientId)
    .eq('created_by', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, pakem: data || [] })
}

const CreateSchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  structure: PakemStructureSchema,
  source_excerpt: z.string().max(20_000).nullable().optional(),
})

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let json: unknown
  try { json = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const parsed = CreateSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 })

  // Confirm the client is the caller's before writing a row that points at it.
  const { data: client } = await supabase
    .from('sw_clients').select('id').eq('id', parsed.data.client_id).eq('created_by', user.id).maybeSingle()
  if (!client) return NextResponse.json({ ok: false, error: 'client not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('sw_script_pakem')
    .insert({
      created_by: user.id,
      client_id: parsed.data.client_id,
      name: parsed.data.name.trim(),
      structure: parsed.data.structure,
      source_excerpt: parsed.data.source_excerpt?.slice(0, 20_000) || null,
    })
    .select('id, client_id, name, structure, source_excerpt, created_at')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, pakem: data })
}
