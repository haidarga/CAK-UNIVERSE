import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { getValidAccessToken } from '@/lib/cakgpt/google-oauth'
import { getDoc, parseDocIntoSections, reconstructBlocksFromLines } from '@/lib/cakgpt/google-docs'
import { runAutoQc } from '@/lib/cakgpt/generation'
import { getGeminiApiKey } from '@/lib/cakgpt/settings'
import type { Block } from '@/lib/cakgpt/schemas'

// POST /api/batches/[id]/google-doc/pull — reads the writer's edits back out
// of the batch's Google Doc and creates a new naskah_version for anything
// that changed. Best-effort text parsing (src/lib/google-docs.ts) — a
// structural rewrite of a section creates fresh blocks (old QC flags on that
// naskah become orphaned, same as any other structural edit).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: batchId } = await params
  const authClient = await createServerClient()
  const { user, unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  const { data: batch } = await authClient.from('sw_batches').select('*').eq('id', batchId).eq('created_by', user.id).maybeSingle()
  if (!batch) return NextResponse.json({ ok: false, error: 'batch not found' }, { status: 404 })
  const docId = (batch.external_doc_ref as { doc_id?: string } | null)?.doc_id
  if (!docId) return NextResponse.json({ ok: false, error: 'this batch has no Google Doc yet — push first' }, { status: 400 })

  const service = createServiceClient()
  let accessToken: string
  try {
    accessToken = await getValidAccessToken(service, user.id)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Google not connected', connect_url: '/api/scriptwriter/google/oauth/start' }, { status: 428 })
  }

  let sections
  try {
    const doc = await getDoc(accessToken, docId)
    sections = parseDocIntoSections(doc)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed to read doc' }, { status: 500 })
  }

  let apiKey: string
  try {
    apiKey = await getGeminiApiKey(service, user.id)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Gemini API key not configured' }, { status: 400 })
  }

  const { data: naskahRows } = await authClient
    .from('sw_naskah').select('id, persona_id, brief_id, current_version_id').eq('batch_id', batchId).eq('created_by', user.id)
  const naskahById = new Map((naskahRows || []).map((n) => [n.id, n]))

  const results: Array<{ naskah_id: string; changed: boolean; error?: string }> = []

  for (const section of sections) {
    const naskah = naskahById.get(section.naskahId)
    if (!naskah) { results.push({ naskah_id: section.naskahId, changed: false, error: 'naskah not found in this batch' }); continue }

    const reconstructed = reconstructBlocksFromLines(section.lines)
    const { data: currentVersion } = await authClient
      .from('sw_naskah_versions').select('id, body, hook_rubric_id, hook_justification, format_meta, generation_meta')
      .eq('id', naskah.current_version_id).maybeSingle()

    const unchanged = currentVersion && JSON.stringify(currentVersion.body) === JSON.stringify(reconstructed)
    if (unchanged) { results.push({ naskah_id: naskah.id, changed: false }); continue }

    try {
      const { data: version, error: versionErr } = await service.rpc('sw_create_naskah_version', {
        p_naskah_id: naskah.id,
        p_body: reconstructed,
        p_hook_rubric_id: currentVersion?.hook_rubric_id ?? null,
        p_hook_justification: currentVersion?.hook_justification ?? null,
        p_format_meta: currentVersion?.format_meta ?? {},
        p_generation_meta: currentVersion?.generation_meta ?? null,
        p_created_via: 'writer_edit',
        p_change_summary: 'Synced from Google Docs',
        p_created_by: user.id,
      })
      if (versionErr || !version) throw new Error(versionErr?.message || 'failed to create version')

      const { data: persona } = await authClient
        .from('sw_personas').select('name, tone, diction_quirks, banned_words, required_words, sample_lines, red_flags')
        .eq('id', naskah.persona_id).eq('created_by', user.id).maybeSingle()
      const { data: brief } = await authClient
        .from('sw_strategist_briefs').select('title, product, platform, fields')
        .eq('id', naskah.brief_id).eq('created_by', user.id).maybeSingle()

      if (persona && brief) {
        await runAutoQc({ supabase: service, apiKey, naskahId: naskah.id, versionId: version.id, persona, brief, blocks: reconstructed as Block[] })
      }

      results.push({ naskah_id: naskah.id, changed: true })
    } catch (e) {
      results.push({ naskah_id: naskah.id, changed: false, error: e instanceof Error ? e.message : 'sync failed' })
    }
  }

  await authClient.from('sw_batches').update({
    external_doc_ref: { ...(batch.external_doc_ref as object), last_pulled_at: new Date().toISOString() },
  }).eq('id', batchId).eq('created_by', user.id)

  return NextResponse.json({ ok: true, synced: results.filter((r) => r.changed).length, unchanged: results.filter((r) => !r.changed && !r.error).length, errors: results.filter((r) => r.error) })
}
