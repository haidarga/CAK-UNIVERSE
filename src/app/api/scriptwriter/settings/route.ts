import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'

// GET never returns the stored key value — only whether one is configured.
// The Settings page is write-mostly by design: keys go in, they don't come
// back out to the browser once saved.
export async function GET() {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const { data } = await supabase.from('sw_user_settings').select('gemini_api_key').eq('created_by', user.id).maybeSingle()
  return NextResponse.json({ ok: true, gemini_configured: !!data?.gemini_api_key })
}

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const geminiApiKey = typeof body.gemini_api_key === 'string' ? body.gemini_api_key.trim() : ''
  if (!geminiApiKey) return NextResponse.json({ ok: false, error: 'gemini_api_key is required' }, { status: 400 })

  const { error } = await supabase
    .from('sw_user_settings')
    .upsert({ created_by: user.id, gemini_api_key: geminiApiKey }, { onConflict: 'created_by' })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, gemini_configured: true })
}
