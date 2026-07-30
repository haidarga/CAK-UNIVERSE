import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'

export async function GET() {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const { data } = await supabase
    .from('sw_user_settings')
    .select('gemini_api_key, studio_api_key, studio_api_url')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    gemini_configured: !!data?.gemini_api_key,
    studio_configured: !!(data?.studio_api_key && data?.studio_api_url),
    studio_url: data?.studio_api_url || '',
  })
}

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }

  const updates: Record<string, string> = { user_id: user.id }

  if (typeof body.gemini_api_key === 'string' && body.gemini_api_key.trim()) {
    updates.gemini_api_key = body.gemini_api_key.trim()
  }
  if (typeof body.studio_api_url === 'string') {
    updates.studio_api_url = body.studio_api_url.trim()
  }
  if (typeof body.studio_api_key === 'string' && body.studio_api_key.trim()) {
    updates.studio_api_key = body.studio_api_key.trim()
  }

  const { error } = await supabase
    .from('sw_user_settings')
    .upsert(updates, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
