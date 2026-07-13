import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { getActiveClientId } from '@/lib/cakgpt/active-client'

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

  const { data, error } = await supabase
    .from('sw_batches').insert({ created_by: user.id, name, client_id: clientId }).select('*').single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, batch: data })
}
