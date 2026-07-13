import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { generateNaskah } from '@/lib/cakgpt/generation'

export async function POST(req: Request) {
  const authClient = await createServerClient()
  const { user, unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }

  const briefId = String(body.brief_id || '')
  const batchId = String(body.batch_id || '')
  if (!briefId || !batchId) return NextResponse.json({ ok: false, error: 'brief_id and batch_id are required' }, { status: 400 })

  const service = createServiceClient()
  const result = await generateNaskah({
    supabase: service,
    createdBy: user.id,
    briefId,
    batchId,
    personaIdOverride: body.persona_id ? String(body.persona_id) : undefined,
    hookRubricIdOverride: body.hook_rubric_id ? String(body.hook_rubric_id) : undefined,
    extraContext: body.extra_context ? String(body.extra_context) : undefined,
    sourceIdeaSessionId: body.source_idea_session_id ? String(body.source_idea_session_id) : undefined,
    sourceIdeaAngleNo: typeof body.source_idea_angle_no === 'number' ? body.source_idea_angle_no : undefined,
  })

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 422 })
  return NextResponse.json({ ok: true, naskah_id: result.naskahId, version_id: result.versionId, flag_counts: result.flagCounts })
}
