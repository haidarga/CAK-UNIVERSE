import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { getActiveClientId } from '@/lib/cakgpt/active-client'

export async function GET() {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const { data, error } = await supabase
    .from('sw_strategist_briefs').select('*').eq('created_by', user.id).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, briefs: data })
}

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const title = String(body.title || '').trim()
  if (!title) return NextResponse.json({ ok: false, error: 'title is required' }, { status: 400 })

  // Verify the persona actually belongs to this user before attaching it —
  // otherwise a brief could silently reference another user's persona id.
  let personaId: string | null = null
  if (body.persona_id) {
    const { data: persona } = await supabase.from('sw_personas').select('id').eq('id', String(body.persona_id)).eq('created_by', user.id).maybeSingle()
    if (!persona) return NextResponse.json({ ok: false, error: 'persona not found' }, { status: 400 })
    personaId = persona.id
  }

  // Explicit client wins; otherwise inherit the active workspace client
  // (silently ignored if the cookie is stale). Ownership-guarded either way.
  let clientId: string | null = null
  if (body.client_id) {
    const { data: client } = await supabase.from('sw_clients').select('id').eq('id', String(body.client_id)).eq('created_by', user.id).eq('is_active', true).maybeSingle()
    if (!client) return NextResponse.json({ ok: false, error: 'client not found' }, { status: 400 })
    clientId = client.id
  } else {
    const activeClient = await getActiveClientId()
    if (activeClient) {
      const { data: client } = await supabase.from('sw_clients').select('id').eq('id', activeClient).eq('created_by', user.id).eq('is_active', true).maybeSingle()
      clientId = client?.id ?? null
    }
  }

  const { data, error } = await supabase
    .from('sw_strategist_briefs')
    .insert({
      created_by: user.id,
      title,
      product: body.product ? String(body.product) : null,
      platform: body.platform ? String(body.platform) : null,
      persona_id: personaId,
      client_id: clientId,
      fields: body.fields ?? {},
      status: body.status && ['draft', 'ready', 'archived'].includes(String(body.status)) ? body.status : 'draft',
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, brief: data })
}
