import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const { data, error } = await supabase.from('sw_personas').select('*').eq('id', id).eq('created_by', user.id).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true, persona: data })
}

const PATCHABLE_FIELDS = ['name', 'tone', 'diction_quirks', 'banned_words', 'required_words', 'sample_lines', 'red_flags', 'is_active'] as const

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  for (const field of PATCHABLE_FIELDS) if (field in body) patch[field] = body[field]
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: 'no valid fields to update' }, { status: 400 })

  const { data, error } = await supabase
    .from('sw_personas').update(patch).eq('id', id).eq('created_by', user.id).select('*').maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true, persona: data })
}
