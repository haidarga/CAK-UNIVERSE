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
import { parseSteeringDurationS } from '@/lib/cakgpt/steering'
import { brandQcWords, parseBrandContext, type BrandContext } from '@/lib/cakgpt/brand-context'

export type GenerateNaskahParams = {
  supabase: SupabaseClient // service-role client — system-initiated writes
  createdBy: string
  briefId: string
  batchId: string
  personaIdOverride?: string
  hookRubricIdOverride?: string
  extraContext?: string
  // Multi-day fan-out: which day of how many this naskah covers for the topic.
  // Omitted = single-day (unchanged behavior).
  dayNo?: number
  dayTotal?: number
  sourceIdeaSessionId?: string
  sourceIdeaAngleNo?: number
  skipCritic?: boolean // bulk fast-path — see runAutoQc
}

export type GenerateNaskahResult =
  | { ok: true; naskahId: string; versionId: string; flagCounts: { blocker: number; warning: number; nit: number } }
  | { ok: false; error: string }

async function getActiveHookRubrics(supabase: SupabaseClient): Promise<HookRubricForPrompt[]> {
  const { data } = await supabase
    .from('sw_hook_rubrics')
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

type HookBankEntry = { cluster: string | null; text: string }

// Stable 32-bit hash — used only to give each (brief × persona) a different
// starting point in its cluster's hook pool. Deterministic on purpose: a real
// random pick would hand the same naskah a different hook on every retry,
// making regeneration unreproducible and diffs meaningless.
function stableHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Pick THE hook for this naskah out of the uploaded bank.
//
// The bank is a pool, not a menu: the caller assigns one line and the model is
// told to use it. Letting the model choose would collapse a multi-day series
// onto whichever line it judged "best" — identical inputs, identical answer,
// same hook five days running.
//
//   1. Narrow to the persona's own cluster (a Dad persona must never open with
//      a Working Mom line). Untagged hooks are always eligible. If nothing
//      matches, fall back to the whole bank rather than dropping the feature.
//   2. Offset the starting index by a hash of (brief, persona) so different
//      topics/personas don't all open with hook #1.
//   3. Step by day, so days 1..N walk consecutive DIFFERENT hooks. Wraps only
//      when the cluster has fewer hooks than days — surfaced in the import UI
//      so the writer can add more instead of silently getting repeats.
export function pickHookForNaskah(args: {
  bank: HookBankEntry[]
  personaCluster: string | null | undefined
  briefId: string
  personaId: string
  dayNo?: number
}): string | undefined {
  const bank = args.bank.filter((h) => h && typeof h.text === 'string' && h.text.trim())
  if (bank.length === 0) return undefined

  const key = args.personaCluster?.trim().toLowerCase()
  const eligible = key
    ? bank.filter((h) => !h.cluster || h.cluster.trim().toLowerCase() === key)
    : bank
  const pool = eligible.length > 0 ? eligible : bank

  const offset = stableHash(`${args.briefId}|${args.personaId}`)
  const step = Math.max(1, args.dayNo || 1) - 1
  return pool[(offset + step) % pool.length].text
}

// How long the script should run. This used to be hardcoded to 30s for EVERY
// naskah, which silently capped how much the model would ever write — a 30s
// script is ~8-12 blocks no matter how much output budget it has, so briefs
// that wanted a longer video always came back looking "cut short". Now the
// content plan gets to say: any brief field whose key looks like a duration
// ("duration", "durasi", "length", "video_length") is parsed for its first
// number. A bare number is read as seconds; an explicit "m"/"menit"/"minute"
// unit converts. Clamped to the range FormatMetaSchema already enforces
// (3-600s) so a typo like "3000" can't produce an absurd target, and falls
// back to the previous 30s default when the plan says nothing.
const DEFAULT_DURATION_S = 30
export function resolveTargetDurationS(fields: Record<string, unknown> | null | undefined): number {
  const raw = fieldLookup(fields, /\b(duration|durasi|length|panjang|video_?length)\b/i)
  if (!raw) return DEFAULT_DURATION_S
  const num = raw.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(',', '.')
  if (!num) return DEFAULT_DURATION_S
  const value = Number(num)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_DURATION_S
  const isMinutes = /\b(m|min|mins|menit|minute|minutes)\b/i.test(raw) || /\d\s*m\b/i.test(raw)
  const seconds = Math.round(isMinutes ? value * 60 : value)
  return Math.min(600, Math.max(3, seconds))
}

// Human-scannable naskah title: "W3·D2 · Jepang · AFGHAN" (week/day only shown
// if the brief carries them). Falls back to the brief title when there's no
// explicit topic. Keeps the queue readable instead of a wall of "Untitled".
export function composeNaskahTitle(
  brief: { title: string; fields?: Record<string, unknown> | null },
  personaName: string,
  // Multi-day fan-out only: distinguishes the N naskah generated from the SAME
  // topic × persona. Without it they'd all share one title and be impossible to
  // tell apart in the triage queue.
  day?: { no?: number; total?: number },
): string {
  const fields = brief.fields || {}
  const topic = fieldLookup(fields, /\b(topic|topik|tema|subject)\b/i) || brief.title
  const week = fieldLookup(fields, /\b(week|minggu|pekan)\b/i)?.match(/\d+/)?.[0]
  const planDay = fieldLookup(fields, /\b(day|hari)\b/i)?.match(/\d+/)?.[0]
  const prefix = [week ? `W${week}` : '', planDay ? `D${planDay}` : ''].filter(Boolean).join('·')
  // Only shown when the run actually spans multiple days — a 1-day run keeps
  // the exact title format it had before this feature existed.
  const daySuffix = day?.no && (day.total ?? 1) > 1 ? `Hari ${day.no}${day.total ? `/${day.total}` : ''}` : ''
  return [prefix, topic, personaName, daySuffix].filter(Boolean).join(' · ')
}

export async function generateNaskah(params: GenerateNaskahParams): Promise<GenerateNaskahResult> {
  const { supabase, createdBy } = params

  // Ownership checks are manual here — the service client bypasses RLS, so
  // every row fetch must explicitly filter by created_by = createdBy.
  const { data: brief, error: briefErr } = await supabase
    .from('sw_strategist_briefs')
    .select('id, title, product, platform, persona_id, client_id, fields, created_by')
    .eq('id', params.briefId)
    .eq('created_by', createdBy)
    .maybeSingle()
  if (briefErr || !brief) return { ok: false, error: 'brief not found' }

  // Brand & Market Context — the client's standing rules. Absent for a brief
  // with no client, or for a client whose context was never filled in; both are
  // normal and simply produce no brand section and no extra QC words.
  const brandClient = brief.client_id
    ? (await supabase
        .from('sw_clients')
        .select('name, brand_context')
        .eq('id', brief.client_id)
        .eq('created_by', createdBy)
        .maybeSingle()).data
    : null
  const brandContext = parseBrandContext(brandClient?.brand_context)

  const personaId = params.personaIdOverride || brief.persona_id
  if (!personaId) return { ok: false, error: 'no persona specified (brief has no default persona)' }

  const { data: persona, error: personaErr } = await supabase
    .from('sw_personas')
    .select('id, name, cluster, tone, diction_quirks, banned_words, required_words, sample_lines, red_flags, is_active, created_by')
    .eq('id', personaId)
    .eq('created_by', createdBy)
    .maybeSingle()
  if (personaErr || !persona || !persona.is_active) return { ok: false, error: 'persona not found or inactive' }

  const { data: batch, error: batchErr } = await supabase
    .from('sw_batches').select('id, created_by, hook_bank').eq('id', params.batchId).eq('created_by', createdBy).maybeSingle()
  if (batchErr || !batch) return { ok: false, error: 'batch not found' }

  // The writer's own hook lines, uploaded with this import (migration 018).
  // Absent = the built-in rubric behavior, unchanged. Tolerates the pre-cluster
  // shape (bare strings) so a batch created before that change still works.
  const hookBank: HookBankEntry[] = Array.isArray(batch.hook_bank)
    ? (batch.hook_bank as unknown[])
        .map((h) => {
          if (typeof h === 'string') return { cluster: null, text: h }
          const o = h as { cluster?: unknown; text?: unknown }
          return typeof o?.text === 'string'
            ? { cluster: typeof o.cluster === 'string' ? o.cluster : null, text: o.text }
            : null
        })
        .filter((h): h is HookBankEntry => !!h && h.text.trim().length > 0)
    : []

  const hookRubrics = await getActiveHookRubrics(supabase)
  if (hookRubrics.length === 0) return { ok: false, error: 'no active hook rubrics seeded — run supabase/seed.sql' }

  let apiKey: string
  try {
    apiKey = await getGeminiApiKey(supabase, createdBy)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gemini API key not configured' }
  }

  const platform = brief.platform || 'tiktok'
  // Writer steering outranks the brief. The prompt states the target duration
  // as a hard number, so a steered "10 detik" has to actually replace that
  // number — asking the model in prose to prefer the steering loses to the
  // explicit contradicting figure and it kept writing the brief's 30s.
  const steeredDurationS = parseSteeringDurationS(params.extraContext)
  const targetDurationS = steeredDurationS ?? resolveTargetDurationS(brief.fields)
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
      brandContext,
      brandName: brandClient?.name || null,
      extraContext: params.extraContext,
      dayNo: params.dayNo,
      dayTotal: params.dayTotal,
      assignedHook: pickHookForNaskah({
        bank: hookBank,
        personaCluster: persona.cluster,
        briefId: params.briefId,
        personaId,
        dayNo: params.dayNo,
      }),
    })
    // Disable thinking in batch mode (skipCritic) — gemini-2.5-flash thinking
    // was eating 15-30s latency AND consuming part of the output token budget
    // for hidden reasoning, causing both slowness and silent truncation. With
    // thinking disabled, the full budget goes to actual JSON output and each
    // call completes in ~5-8s instead of ~30s. 16K is generous — a 60-block
    // naskah JSON is well under that.
    const raw = await callGeminiJSON({
      apiKey,
      prompt,
      responseSchema: GENERATION_RESPONSE_SCHEMA,
      temperature: 0.8,
      maxOutputTokens: params.skipCritic ? 16000 : 32000,
      disableThinking: params.skipCritic,
    })
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
      .from('sw_hook_rubrics').select('id').eq('slug', generation.hook_type).eq('is_active', true).maybeSingle()
    hookRubricId = matched?.id || null
  }

  const blocks: Block[] = generation.body.map((b) => ({ ...b, block_id: generateBlockId() }))

  // Create the naskah identity row first (create_naskah_version locks it, so it must exist).
  const { data: naskahRow, error: naskahErr } = await supabase
    .from('sw_naskah')
    .insert({
      created_by: createdBy,
      batch_id: params.batchId,
      brief_id: params.briefId,
      persona_id: personaId,
      // Readable, scannable title (week · day · topic · persona) so the fan-out
      // doesn't produce a queue full of "Untitled naskah".
      title: composeNaskahTitle(brief, persona.name, { no: params.dayNo, total: params.dayTotal }),
      // Stored as a real column (not just inside the title) so lists can ORDER
      // BY it — jobs finish out of order, so any timestamp sort scrambles a
      // series. Null for single-day naskah.
      day_no: params.dayNo ?? null,
      status: 'draft',
      source: params.sourceIdeaSessionId ? 'promoted_from_idea' : 'generated',
      source_idea_session_id: params.sourceIdeaSessionId || null,
      source_idea_angle_no: params.sourceIdeaAngleNo ?? null,
    })
    .select('id')
    .single()
  if (naskahErr || !naskahRow) return { ok: false, error: `failed to create naskah row: ${naskahErr?.message}` }

  const { data: version, error: versionErr } = await supabase.rpc('sw_create_naskah_version', {
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

  const flagCounts = await runAutoQc({ supabase, apiKey, naskahId: naskahRow.id, versionId: version.id, persona, brief, blocks, brandContext, skipCritic: params.skipCritic })
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
  // The client's Brand & Market Context. Optional: callers that have no client
  // (or predate the feature) keep the persona-only behavior unchanged.
  brandContext?: BrandContext | null
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
  const brandWords = brandQcWords(opts.brandContext)
  const ruleFlags = runRuleBasedQc({
    blocks,
    bannedWords: persona.banned_words,
    requiredWords: persona.required_words,
    brandBannedWords: brandWords.banned,
    brandRequiredWords: brandWords.required,
  })
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
    // Same thinking-token squeeze as the generation call above: a critic pass
    // over a long naskah has to reason about every block before emitting flags.
    const raw = await callGeminiJSON({ apiKey, prompt, responseSchema: CRITIC_RESPONSE_SCHEMA, temperature: 0.4, maxOutputTokens: 16000 })
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
    await supabase.from('sw_qc_flags').insert(flagRows)
  }

  const counts = { blocker: 0, warning: 0, nit: 0 }
  for (const f of flagRows) counts[f.severity as keyof typeof counts]++
  void validBlockIds // referenced above via blockById; kept for clarity of intent
  return counts
}
