import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { getActiveClientId } from '@/lib/cakgpt/active-client'
import { MAX_HOOK_BANK } from '@/lib/cakgpt/schemas'

export async function GET() {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const { data, error } = await supabase
    .from('sw_batches').select('*').eq('created_by', user.id).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, batches: data })
}

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* name is optional, empty body is fine */ }
  const name = String(body.name || '').trim() || `Batch ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`

  // Client at creation: explicit body.client_id wins; otherwise inherit the
  // active workspace client (silently ignored if that cookie is stale).
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

  // Optional per-import hook bank (the writer's own ready-made opening lines).
  // Bounded + sanitized here because it is injected into EVERY generation
  // prompt for this batch — an unbounded array would silently inflate every
  // call. Absent/empty stores null, and generation falls back to the built-in
  // hook rubric behavior.
  // Each entry is {cluster, text}: generation draws from the persona's OWN
  // cluster, so the tag has to survive the round trip.
  let hookBank: Array<{ cluster: string | null; text: string }> | null = null
  if (Array.isArray(body.hook_bank)) {
    const lines = (body.hook_bank as unknown[])
      .map((h) => {
        if (typeof h === 'string') return { cluster: null, text: h.trim() }
        const o = h as { cluster?: unknown; text?: unknown }
        if (typeof o?.text !== 'string') return null
        const cluster = typeof o.cluster === 'string' && o.cluster.trim() ? o.cluster.trim().slice(0, 80) : null
        return { cluster, text: o.text.trim() }
      })
      .filter((h): h is { cluster: string | null; text: string } => !!h && h.text.length > 0)
      .slice(0, MAX_HOOK_BANK)
      .map((h) => ({ cluster: h.cluster, text: h.text.slice(0, 400) }))
    if (lines.length > 0) hookBank = lines
  }

  const { data, error } = await supabase
    .from('sw_batches').insert({ created_by: user.id, name, client_id: clientId, hook_bank: hookBank }).select('*').single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, batch: data })
}
