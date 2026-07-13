import type { SupabaseClient } from '@supabase/supabase-js'
import { generateBlockId } from '@/lib/cakgpt/block-id'
import { callGeminiJSON, LLMError } from '@/lib/cakgpt/llm'
import {
  buildCriticPrompt,
  buildGenerationPrompt,
  CRITIC_RESPONSE_SCHEMA,
  GENERATION_RESPONSE_SCHEMA,
  type HookRubricForPrompt,
} from '@/lib/cakgpt/prompts'
import { CriticOutputSchema, GenerationOutputSchema, type Block } from '@/lib/cakgpt/schemas'
import { runRuleBasedQc } from '@/lib/cakgpt/qc-rules'
import { getGeminiApiKey } from '@/lib/cakgpt/settings'

export type GenerateNaskahParams = {
  supabase: SupabaseClient // service-role client — system-initiated writes
  createdBy: string
  briefId: string
  batchId: string
  personaIdOverride?: string
  hookRubricIdOverride?: string
  extraContext?: string
  sourceIdeaSessionId?: string
  sourceIdeaAngleNo?: number
  skipCritic?: boolean // bulk fast-path — see runAutoQc
}

export type GenerateNaskahResult =
  | { ok: true; naskahId: string; versionId: string; flagCounts: { blocker: number; warning: number; nit: number } }
  | { ok: false; error: string }

async function getActiveHookRubrics(supabase: SupabaseClient): Promise<HookRubricForPrompt[]> {
  const { data } = await supabase
    .from('hook_rubrics')
    .select('slug, name, description, example')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return data || []
}

// Find a brief field whose KEY matches a pattern (case-insensitive), e.g. the
// "Topic"/"Week"/"Day" columns from an imported content plan.
function fieldLookup(fields: Record<string, unknown> | null | undefined, re: RegExp): string | null {
  if (!fields) return null
  for (const [k, v] of Object.entries(fields)) {
    if (re.test(k) && v != null && String(v).trim()) return String(v).trim()
  }
  return null
}

// Human-scannable naskah title: "W3·D2 · Jepang · AFGHAN" (week/day only shown
// if the brief carries them). Falls back to the brief title when there's no
// explicit topic. Keeps the queue readable instead of a wall of "Untitled".
export function composeNaskahTitle(brief: { title: string; fields?: Record<string, unknown> | null }, personaName: string): string {
  const fields = brief.fields || {}
  const topic = fieldLookup(fields, /\b(topic|topik|tema|subject)\b/i) || brief.title
  const week = fieldLookup(fields, /\b(week|minggu|pekan)\b/i)?.match(/\d+/)?.[0]
  const day = fieldLookup(fields, /\b(day|hari)\b/i)?.match(/\d+/)?.[0]
  const prefix = [week ? `W${week}` : '', day ? `D${day}` : ''].filter(Boolean).join('·')
  return [prefix, topic, personaName].filter(Boolean).join(' · ')
}

export async function generateNaskah(params: GenerateNaskahParams): Promise<GenerateNaskahResult> {
  const { supabase, createdBy } = params

  // Ownership checks are manual here — the service client bypasses RLS, so
  // every row fetch must explicitly filter by created_by = createdBy.
  const { data: brief, error: briefErr } = await supabase
    .from('strategist_briefs')
    .select('id, title, product, platform, persona_id, fields, created_by')
    .eq('id', params.briefId)
    .eq('created_by', createdBy)
    .maybeSingle()
  if (briefErr || !brief) return { ok: false, error: 'brief not found' }

  const personaId = params.personaIdOverride || brief.persona_id
  if (!personaId) return { ok: false, error: 'no persona specified (brief has no default persona)' }

  const { data: persona, error: personaErr } = await supabase
    .from('personas')
    .select('id, name, tone, diction_quirks, banned_words, required_words, sample_lines, red_flags, is_active, created_by')
    .eq('id', personaId)
    .eq('created_by', createdBy)
    .maybeSingle()
  if (personaErr || !persona || !persona.is_active) return { ok: false, error: 'persona not found or inactive' }

  const { data: batch, error: batchErr } = await supabase
    .from('batches').select('id, created_by').eq('id', params.batchId).eq('created_by', createdBy).maybeSingle()
  if (batchErr || !batch) return { ok: false, error: 'batch not found' }

  const hookRubrics = await getActiveHookRubrics(supabase)
  if (hookRubrics.length === 0) return { ok: false, error: 'no active hook rubrics seeded — run supabase/seed.sql' }

  let apiKey: string
  try {
    apiKey = await getGeminiApiKey(supabase, createdBy)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gemini API key not configured' }
  }

  const platform = brief.platform || 'tiktok'
  const targetDurationS = 30
  const aspectRatio = '9:16'

  let generation
  try {
    const prompt = buildGenerationPrompt({
      persona,
      brief,
      hookRubrics,
      platform,
      targetDurationS,
      aspectRatio,
      extraContext: params.extraContext,
    })
    const raw = await callGeminiJSON({ apiKey, prompt, responseSchema: GENERATION_RESPONSE_SCHEMA, temperature: 0.8 })
    generation = GenerationOutputSchema.parse(raw)
  } catch (e) {
    const msg = e instanceof LLMError ? e.message : e instanceof Error ? e.message : 'generation failed'
    return { ok: false, error: `generation failed: ${msg}` }
  }

  // Resolve hook_rubric_id. Override (from idea-mode promotion) always wins;
  // otherwise trust the model's slug only if it matches a real active rubric —
  // never let a hallucinated slug silently become a dangling reference.
  let hookRubricId: string | null = null
  if (params.hookRubricIdOverride) {
    hookRubricId = params.hookRubricIdOverride
  } else {
    const { data: matched } = await supabase
      .from('hook_rubrics').select('id').eq('slug', generation.hook_type).eq('is_active', true).maybeSingle()
    hookRubricId = matched?.id || null
  }

  const blocks: Block[] = generation.body.map((b) => ({ ...b, block_id: generateBlockId() }))

  // Create the naskah identity row first (create_naskah_version locks it, so it must exist).
  const { data: naskahRow, error: naskahErr } = await supabase
    .from('naskah')
    .insert({
      created_by: createdBy,
      batch_id: params.batchId,
      brief_id: params.briefId,
      persona_id: personaId,
      // Readable, scannable title (week · day · topic · persona) so the fan-out
      // doesn't produce a queue full of "Untitled naskah".
      title: composeNaskahTitle(brief, persona.name),
      status: 'draft',
      source: params.sourceIdeaSessionId ? 'promoted_from_idea' : 'generated',
      source_idea_session_id: params.sourceIdeaSessionId || null,
      source_idea_angle_no: params.sourceIdeaAngleNo ?? null,
    })
    .select('id')
    .single()
  if (naskahErr || !naskahRow) return { ok: false, error: `failed to create naskah row: ${naskahErr?.message}` }

  const { data: version, error: versionErr } = await supabase.rpc('create_naskah_version', {
    p_naskah_id: naskahRow.id,
    p_body: blocks,
    p_hook_rubric_id: hookRubricId,
    p_hook_justification: generation.hook_justification,
    p_format_meta: generation.format_meta,
    p_generation_meta: { persona_snapshot: persona, brief_fields_snapshot: brief.fields },
    p_created_via: 'ai_generation',
    p_change_summary: null,
    p_created_by: createdBy,
  })
  if (versionErr || !version) return { ok: false, error: `failed to create naskah version: ${versionErr?.message}` }

  const flagCounts = await runAutoQc({ supabase, apiKey, naskahId: naskahRow.id, versionId: version.id, persona, brief, blocks, skipCritic: params.skipCritic })
  return { ok: true, naskahId: naskahRow.id, versionId: version.id, flagCounts }
}

export async function runAutoQc(opts: {
  supabase: SupabaseClient
  apiKey: string
  naskahId: string
  versionId: string
  persona: { name: string; tone: unknown; diction_quirks: unknown; banned_words: string[]; required_words: string[]; sample_lines: unknown; red_flags: unknown }
  brief: { title: string; product: string | null; platform: string | null; fields: Record<string, unknown> }
  blocks: Block[]
  skipCritic?: boolean // bulk fast-path: run only the (free) rule-based pass, skip the LLM critic call
}): Promise<{ blocker: number; warning: number; nit: number }> {
  const { supabase, apiKey, naskahId, versionId, persona, brief, blocks } = opts
  const validBlockIds = new Set(blocks.map((b) => b.block_id))
  const blockById = new Map(blocks.map((b) => [b.block_id, b]))

  type FlagRow = {
    naskah_id: string
    naskah_version_id: string
    target_ref: { block_id: string; display_snapshot: { section_key: string; shot_no: number; line_no: number } }
    category: string
    severity: string
    message: string
    evidence: string | null
    source: 'auto_rule' | 'auto_llm'
  }
  const flagRows: FlagRow[] = []

  // Pass 1 — deterministic, always trusted as blocker-tier.
  const ruleFlags = runRuleBasedQc({ blocks, bannedWords: persona.banned_words, requiredWords: persona.required_words })
  for (const f of ruleFlags) {
    const block = blockById.get(f.block_id)
    if (!block) continue
    flagRows.push({
      naskah_id: naskahId,
      naskah_version_id: versionId,
      target_ref: { block_id: f.block_id, display_snapshot: { section_key: block.section_key, shot_no: block.shot_no, line_no: block.line_no } },
      category: f.category,
      severity: f.severity,
      message: f.message,
      evidence: f.evidence || null,
      source: 'auto_rule',
    })
  }

  // Pass 2 — adversarial LLM critic. Best-effort: if this fails, the naskah
  // still has the rule-based flags and can be triaged (fail-open on the LLM
  // pass, fail-closed on the rule-based pass — the rule pass is what
  // guarantees banned words/missing-required-content are never silently missed).
  // Skipped entirely in bulk (skipCritic) — halves the Gemini calls per naskah;
  // the writer can trigger the full critic per naskah via /qc/rerun.
  if (!opts.skipCritic) try {
    const prompt = buildCriticPrompt({ persona, brief, blocks: blocks.map((b) => ({ block_id: b.block_id, section_key: b.section_key, shot_no: b.shot_no, line_no: b.line_no, text: b.text })) })
    const raw = await callGeminiJSON({ apiKey, prompt, responseSchema: CRITIC_RESPONSE_SCHEMA, temperature: 0.4 })
    const critic = CriticOutputSchema.parse(raw)
    for (const f of critic.flags) {
      const block = blockById.get(f.block_id)
      if (!block) continue // critic hallucinated a block_id — drop it, never insert a dangling target_ref.
      // Severity cap (ARCHITECTURE.md §5, §10 assumption #3): only rule-based
      // flags default to blocker in MVP, keeping the bulk-approve bar
      // conservative and inspectable. Downgrade any LLM "blocker" claim.
      const severity = f.severity === 'blocker' ? 'warning' : f.severity
      flagRows.push({
        naskah_id: naskahId,
        naskah_version_id: versionId,
        target_ref: { block_id: f.block_id, display_snapshot: { section_key: block.section_key, shot_no: block.shot_no, line_no: block.line_no } },
        category: f.category,
        severity,
        message: f.message,
        evidence: f.evidence || null,
        source: 'auto_llm',
      })
    }
  } catch {
    // Swallowed deliberately — critic pass is best-effort. Rule-based flags
    // (if any) are already queued for insert above.
  }

  if (flagRows.length > 0) {
    await supabase.from('qc_flags').insert(flagRows)
  }

  const counts = { blocker: 0, warning: 0, nit: 0 }
  for (const f of flagRows) counts[f.severity as keyof typeof counts]++
  void validBlockIds // referenced above via blockById; kept for clarity of intent
  return counts
}
