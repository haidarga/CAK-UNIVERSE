import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { NaskahImportCommitSchema, type Block } from '@/lib/cakgpt/schemas'
import { generateBlockId } from '@/lib/cakgpt/block-id'
import { runAutoQc } from '@/lib/cakgpt/generation'
import { getGeminiApiKey } from '@/lib/cakgpt/settings'

export const runtime = 'nodejs'
export const maxDuration = 120

const CONCURRENCY = 5
// Backstop before req.json() buffers the body. A max-legit payload (40 naskah ×
// 80 blocks × 2000 chars) is ~10 MB; 12 MB rejects absurd bodies up front while
// the Zod caps in NaskahImportCommitSchema remain the authoritative per-field bounds.
const MAX_COMMIT_BYTES = 12 * 1024 * 1024

// POST /api/naskah/import/commit — persist reviewed imported naskah as real
// naskah + versions, run Auto-QC on each, and drop them into a fresh batch the
// caller is redirected to. Every naskah needs a brief_id + persona_id (NOT NULL,
// 0001_init.sql), so we mint one stub brief for the whole import and attach the
// chosen persona.
export async function POST(req: Request) {
  const authClient = await createServerClient()
  const { user, unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  const declaredLen = Number(req.headers.get('content-length') || '0')
  if (declaredLen > MAX_COMMIT_BYTES) return NextResponse.json({ ok: false, error: 'request too large' }, { status: 413 })

  let json: unknown
  try { json = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const parsed = NaskahImportCommitSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid payload: expected { naskah: [...], persona_id, client_id?, batch_name? }' }, { status: 400 })
  const { naskah, persona_id } = parsed.data

  // Ownership: persona (also the voice profile Auto-QC checks against).
  const { data: persona } = await authClient
    .from('personas')
    .select('id, name, tone, diction_quirks, banned_words, required_words, sample_lines, red_flags, is_active')
    .eq('id', persona_id).eq('created_by', user.id).maybeSingle()
  if (!persona || !persona.is_active) return NextResponse.json({ ok: false, error: 'persona not found or inactive' }, { status: 400 })

  // Ownership: client (optional).
  let clientId: string | null = null
  if (parsed.data.client_id) {
    const { data: client } = await authClient.from('clients').select('id').eq('id', parsed.data.client_id).eq('created_by', user.id).eq('is_active', true).maybeSingle()
    if (!client) return NextResponse.json({ ok: false, error: 'client not found' }, { status: 400 })
    clientId = client.id
  }

  const service = createServiceClient()
  let apiKey: string
  try {
    apiKey = await getGeminiApiKey(service, user.id)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Gemini API key not configured' }, { status: 400 })
  }

  const batchName = parsed.data.batch_name?.trim() || `Imported naskah ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const { data: batch, error: batchErr } = await service
    .from('batches').insert({ created_by: user.id, name: batchName, client_id: clientId }).select('id').single()
  if (batchErr || !batch) return NextResponse.json({ ok: false, error: `failed to create batch: ${batchErr?.message}` }, { status: 500 })

  const { data: brief, error: briefErr } = await service
    .from('strategist_briefs')
    .insert({ created_by: user.id, title: `Imported: ${batchName}`, client_id: clientId, persona_id, fields: { imported: 'true' }, status: 'ready' })
    .select('id, title, product, platform, fields').single()
  if (briefErr || !brief) return NextResponse.json({ ok: false, error: `failed to create stub brief: ${briefErr?.message}` }, { status: 500 })

  const briefForQc = { title: brief.title, product: brief.product, platform: brief.platform, fields: (brief.fields || {}) as Record<string, unknown> }

  // Capture non-null values into consts — TS control-flow narrowing (user/batch/
  // brief/persona were all null-guarded above) does not carry into the async
  // worker() closure below, so bind them here where the narrowing still holds.
  const userId = user.id
  const batchId = batch.id
  const briefId = brief.id
  const personaForQc = persona

  const results: Array<{ title: string; ok: boolean; naskah_id?: string; error?: string }> = []
  let cursor = 0
  async function worker() {
    while (cursor < naskah.length) {
      const idx = cursor++
      const item = naskah[idx]
      try {
        // Server assigns block_ids (never trust ids from the model/client).
        const blocks: Block[] = item.body.map((b) => ({ ...b, block_id: generateBlockId() }))

        const { data: naskahRow, error: nErr } = await service
          .from('naskah')
          .insert({
            created_by: userId, batch_id: batchId, brief_id: briefId, persona_id,
            title: item.title, status: 'draft',
            source: 'generated', // CHECK allows generated|promoted_from_idea only; closest fit for an import
          })
          .select('id').single()
        if (nErr || !naskahRow) throw new Error(nErr?.message || 'failed to create naskah')

        const { data: version, error: vErr } = await service.rpc('create_naskah_version', {
          p_naskah_id: naskahRow.id,
          p_body: blocks,
          p_hook_rubric_id: null,
          p_hook_justification: null,
          p_format_meta: {},
          p_generation_meta: { imported: true },
          p_created_via: 'writer_edit',
          p_change_summary: 'Imported from document',
          p_created_by: userId,
        })
        if (vErr || !version) throw new Error(vErr?.message || 'failed to create version')

        await runAutoQc({ supabase: service, apiKey, naskahId: naskahRow.id, versionId: version.id, persona: personaForQc, brief: briefForQc, blocks })
        results.push({ title: item.title, ok: true, naskah_id: naskahRow.id })
      } catch (e) {
        results.push({ title: item.title, ok: false, error: e instanceof Error ? e.message : 'import failed' })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, naskah.length) }, worker))

  return NextResponse.json({
    ok: true,
    batch_id: batch.id,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  })
}
