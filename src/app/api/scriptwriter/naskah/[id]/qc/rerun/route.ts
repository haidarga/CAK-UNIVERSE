import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { runAutoQc } from '@/lib/cakgpt/generation'
import { getGeminiApiKey } from '@/lib/cakgpt/settings'
import type { Block } from '@/lib/cakgpt/schemas'

// Manual escape hatch for when the critic pass failed/was skipped (e.g. a
// manual edit via PATCH /versions only runs the rule-based pass). NOTE: this
// does not clear prior flags on the same version (qc_flags is append-only by
// design) — calling it repeatedly on an unchanged version will accumulate
// duplicate flags. Intended as an occasional action, not a polling loop.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authClient = await createServerClient()
  const { user, unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  const { data: naskah } = await authClient
    .from('naskah').select('id, persona_id, brief_id, current_version_id').eq('id', id).eq('created_by', user.id).maybeSingle()
  if (!naskah || !naskah.current_version_id) return NextResponse.json({ ok: false, error: 'not found or no current version' }, { status: 404 })

  const { data: version } = await authClient
    .from('naskah_versions').select('id, body').eq('id', naskah.current_version_id).maybeSingle()
  // Explicit created_by filter here too (not just relying on RLS) — defense
  // in depth so a future RLS policy change can't silently turn this into a
  // cross-user read.
  const { data: persona } = await authClient
    .from('personas').select('name, tone, diction_quirks, banned_words, required_words, sample_lines, red_flags')
    .eq('id', naskah.persona_id).eq('created_by', user.id).maybeSingle()
  const { data: brief } = await authClient
    .from('strategist_briefs').select('title, product, platform, fields')
    .eq('id', naskah.brief_id).eq('created_by', user.id).maybeSingle()
  if (!version || !persona || !brief) return NextResponse.json({ ok: false, error: 'related data missing' }, { status: 500 })

  const service = createServiceClient()
  let apiKey: string
  try {
    apiKey = await getGeminiApiKey(service, user.id)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Gemini API key not configured' }, { status: 400 })
  }

  const flagCounts = await runAutoQc({
    supabase: service,
    apiKey,
    naskahId: id,
    versionId: version.id,
    persona,
    brief,
    blocks: version.body as Block[],
  })

  return NextResponse.json({ ok: true, flag_counts: flagCounts })
}
