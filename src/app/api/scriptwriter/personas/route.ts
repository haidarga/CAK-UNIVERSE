import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { getActiveClientId } from '@/lib/cakgpt/active-client'

export async function GET() {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const { data, error } = await supabase
    .from('sw_personas')
    .select('*')
    .eq('created_by', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, personas: data })
}

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ ok: false, error: 'name is required' }, { status: 400 })
  const cluster = typeof body.cluster === 'string' && body.cluster.trim() ? body.cluster.trim().slice(0, 80) : null

  // Created inside a workspace → scoped to that client; created under
  // "All clients" → shared (null, shows in every workspace).
  let clientId: string | null = null
  const activeClient = await getActiveClientId()
  if (activeClient) {
    const { data: client } = await supabase.from('sw_clients').select('id').eq('id', activeClient).eq('created_by', user.id).eq('is_active', true).maybeSingle()
    clientId = client?.id ?? null
  }

  const { data, error } = await supabase
    .from('sw_personas')
    .insert({
      created_by: user.id,
      name,
      cluster,
      client_id: clientId,
      tone: body.tone ?? {},
      diction_quirks: body.diction_quirks ?? [],
      banned_words: Array.isArray(body.banned_words) ? body.banned_words : [],
      required_words: Array.isArray(body.required_words) ? body.required_words : [],
      sample_lines: body.sample_lines ?? [],
      red_flags: body.red_flags ?? [],
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, persona: data })
}
