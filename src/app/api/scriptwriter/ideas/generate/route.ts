import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { generateIdeas } from '@/lib/cakgpt/idea-generation'

export async function POST(req: Request) {
  const authClient = await createServerClient()
  const { user, unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }

  const service = createServiceClient()
  const result = await generateIdeas({
    supabase: service,
    createdBy: user.id,
    personaId: body.persona_id ? String(body.persona_id) : undefined,
    briefId: body.brief_id ? String(body.brief_id) : undefined,
    adHocContext: body.ad_hoc_context ? String(body.ad_hoc_context) : undefined,
    count: typeof body.count === 'number' ? body.count : undefined,
  })

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 422 })
  return NextResponse.json({ ok: true, idea_session_id: result.ideaSessionId, angles: result.angles })
}
