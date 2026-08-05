// Script Pakem — a brand's house script structure, learned from a reference
// script the client already approved.
//
// Distinct from the two neighbours it sits between:
//   Brand Context  → WHAT may be said (claims, banned words, positioning)
//   Script Pakem   → HOW the script is SHAPED (section flow, shot count, hook
//                    and CTA style, pacing)
//   Content Format → what KIND of video it is (talking head, vlog, skit)
//
// The AI extracts the pakem from an example script, but every field is meant to
// be edited afterwards: the extraction is a first draft, not a verdict. Shot
// count in particular is something the writer overrides constantly, so it is
// stored as an explicit min/max rather than baked into prose.
import { z } from 'zod'

const SHORT = 200
const LONG = 2000

export const PakemStructureSchema = z.object({
  // The order of beats, e.g. ["hook", "masalah", "solusi", "bukti", "cta"].
  section_flow: z.array(z.string().max(60)).max(20).default([]),
  // Stored as a range because a pakem is a guide, not a fixed cut list. Null on
  // either side means "no constraint on that end".
  shot_min: z.coerce.number().int().min(1).max(100).nullable().default(null),
  shot_max: z.coerce.number().int().min(1).max(100).nullable().default(null),
  hook_style: z.string().max(LONG).default(''),
  cta_style: z.string().max(LONG).default(''),
  pacing: z.string().max(LONG).default(''),
  // Free-form extra constraints, one per line — the escape hatch for anything
  // the fixed fields above cannot express.
  extra_rules: z.string().max(4000).default(''),
  // Which content format the reference script appears to be. Used ONLY to warn
  // about a clash at generate time; it never silently forces a format.
  detected_format: z.string().max(120).nullable().default(null),
  // A couple of verbatim lines kept for voice reference. Deliberately short:
  // a full script in the prompt makes the model copy the CONTENT (product
  // claims, specific phrasing) instead of the STRUCTURE.
  voice_sample: z.string().max(1200).default(''),
  // Which briefs this pakem is FOR, one "field: value" per line, e.g.
  //   category: Trend-adapted Format
  //   region: Jepang
  // Used by Auto mode to pick a pakem per brief. Empty = never auto-matched
  // (the pakem is still selectable by hand).
  match_rules: z.string().max(2000).default(''),
})
export type PakemStructure = z.infer<typeof PakemStructureSchema>

export const EMPTY_PAKEM: PakemStructure = {
  section_flow: [], shot_min: null, shot_max: null,
  hook_style: '', cta_style: '', pacing: '', extra_rules: '',
  detected_format: null, voice_sample: '', match_rules: '',
}

export const PakemSchema = z.object({
  name: z.string().min(1).max(SHORT),
  structure: PakemStructureSchema,
})

export function parsePakemStructure(raw: unknown): PakemStructure | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const parsed = PakemStructureSchema.safeParse(raw)
  if (!parsed.success) return null
  return isPakemEmpty(parsed.data) ? null : parsed.data
}

export function isPakemEmpty(p: PakemStructure | null | undefined): boolean {
  if (!p) return true
  return (
    p.section_flow.length === 0 &&
    p.shot_min === null && p.shot_max === null &&
    !p.hook_style.trim() && !p.cta_style.trim() && !p.pacing.trim() &&
    !p.extra_rules.trim() && !p.voice_sample.trim()
  )
}

export function parseExtraRules(value: string | null | undefined): string[] {
  return (value || '')
    .split('\n')
    .map((l) => l.replace(/^\s*[-–—•*]\s*/, '').trim())
    .filter(Boolean)
}

/** Human-readable shot range for UI and prompt, or null when unconstrained. */
export function formatShotRange(p: PakemStructure): string | null {
  const { shot_min: min, shot_max: max } = p
  if (min === null && max === null) return null
  if (min !== null && max !== null) return min === max ? `${min} shot` : `${min}-${max} shot`
  return min !== null ? `minimal ${min} shot` : `maksimal ${max} shot`
}

const CONTROL_AND_HIDDEN_CHARS_RE = new RegExp(
  '[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u202A-\\u202E\\uFEFF]',
  'g',
)
function clean(v: string): string {
  return v.replace(CONTROL_AND_HIDDEN_CHARS_RE, '').trim()
}

/**
 * Warns when a pakem's own format disagrees with the content format the writer
 * just ticked.
 *
 * Deliberately a WARNING and not an override: the tick is a conscious action
 * taken seconds ago, the pakem is a stored default — but silently discarding
 * either one would leave the writer wondering why the output ignored them.
 */
export function detectPakemFormatClash(
  pakem: PakemStructure | null | undefined,
  selectedFormatKeys: string[],
): { clash: boolean; message: string } | null {
  const detected = pakem?.detected_format?.trim()
  if (!detected || selectedFormatKeys.length === 0) return null
  const detectedLower = detected.toLowerCase()
  const matches = selectedFormatKeys.some(
    (k) => k.toLowerCase() === detectedLower || k.toLowerCase().replace(/_/g, ' ') === detectedLower.replace(/_/g, ' '),
  )
  if (matches) return null
  return {
    clash: true,
    message: `Pakem ini bentuknya "${detected}", tapi tipe konten yang lu centang: ${selectedFormatKeys.join(', ')}. Tipe konten yang bakal menang — pakemnya cuma dipakai buat struktur & gaya.`,
  }
}

/**
 * The prompt block. Sits with the other locked constraints, below the writer's
 * steering and the content format: format decides the KIND of video, the pakem
 * shapes it — so if the two disagree, format wins and the pakem still supplies
 * flow, pacing and voice.
 */
export function pakemSection(pakem: PakemStructure | null | undefined, pakemName?: string | null): string {
  if (isPakemEmpty(pakem)) return ''
  const p = pakem as PakemStructure

  const lines: string[] = []
  if (p.section_flow.length > 0) {
    lines.push(`- Follow this beat order exactly: ${p.section_flow.map(clean).filter(Boolean).join(' -> ')}. Use these as the section_key values.`)
  }
  const range = formatShotRange(p)
  if (range) lines.push(`- Shot count: ${range}. Stay inside that range.`)
  if (p.hook_style.trim()) lines.push(`- Hook must work like this: ${clean(p.hook_style)}`)
  if (p.cta_style.trim()) lines.push(`- CTA must work like this: ${clean(p.cta_style)}`)
  if (p.pacing.trim()) lines.push(`- Pacing / line length: ${clean(p.pacing)}`)
  for (const rule of parseExtraRules(p.extra_rules)) lines.push(`- ${clean(rule)}`)

  if (lines.length === 0 && !p.voice_sample.trim()) return ''

  return [
    `## SCRIPT PAKEM${pakemName ? ` — ${clean(pakemName)}` : ''} (the brand's house structure)`,
    'This is how scripts for this brand are built. Match its SHAPE, not its content: the topic comes',
    'from the brief, the structure comes from here.',
    ...lines,
    p.voice_sample.trim()
      ? `\nVoice reference — imitate the RHYTHM and register of these lines, never reuse their wording or claims:\n${clean(p.voice_sample)}`
      : '',
    '',
  ].filter(Boolean).join('\n')
}


// ── Auto-matching a pakem to a brief ────────────────────────────────────────
//
// Deliberately deterministic rather than an LLM call. Picking one of three or
// four options per brief would cost an extra model call for every brief in a
// 40-brief run, give a different answer on a re-run, and — worst — leave no way
// to explain why a particular pakem was chosen. These rules can be shown in the
// UI before the writer commits.

export type MatchRule = { field: string; value: string }

/** One "field: value" per line. A line without a colon is ignored, not guessed. */
export function parseMatchRules(value: string | null | undefined): MatchRule[] {
  const out: MatchRule[] = []
  for (const raw of (value || '').split('\n')) {
    const line = raw.replace(/^\s*[-–—•*]\s*/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const field = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    if (field && val) out.push({ field, value: val })
  }
  return out
}

/**
 * How well a pakem's rules fit one brief — the number of rules that match.
 *
 * Rules are OR'd and scored rather than AND'd: a plan rarely fills every column
 * on every row, so requiring all rules to match would leave most briefs
 * unmatched. Comparison is loose on both sides (case-insensitive, substring)
 * because strategist spreadsheets spell the same column "region" / "Region" /
 * "region_target" and the same value "Jepang" / "Jepang (Osaka)".
 */
export function scorePakemForBrief(rules: MatchRule[], fields: Record<string, unknown> | null | undefined): number {
  if (rules.length === 0 || !fields) return 0
  const entries = Object.entries(fields).map(([k, v]) => [k.toLowerCase(), String(v ?? '').toLowerCase()] as const)
  let score = 0
  for (const rule of rules) {
    const f = rule.field.toLowerCase()
    const v = rule.value.toLowerCase()
    if (entries.some(([k, val]) => k.includes(f) && val.includes(v))) score += 1
  }
  return score
}

export type PakemCandidate = {
  id: string
  name: string
  structure: PakemStructure
  is_default?: boolean | null
}

export type PakemMatch = {
  pakemId: string | null
  pakemName: string | null
  /** Why it was chosen — surfaced in the UI so Auto is never a black box. */
  reason: 'matched' | 'default' | 'none'
  score: number
}

/**
 * Picks the pakem for ONE brief: best rule match, else the brand default, else
 * nothing. Ties go to the earlier pakem in the list (creation order), so the
 * same inputs always produce the same run.
 */
export function pickPakemForBrief(
  candidates: PakemCandidate[],
  fields: Record<string, unknown> | null | undefined,
): PakemMatch {
  let best: { c: PakemCandidate; score: number } | null = null
  for (const c of candidates) {
    const score = scorePakemForBrief(parseMatchRules(c.structure?.match_rules), fields)
    if (score > 0 && (!best || score > best.score)) best = { c, score }
  }
  if (best) return { pakemId: best.c.id, pakemName: best.c.name, reason: 'matched', score: best.score }

  const fallback = candidates.find((c) => c.is_default)
  if (fallback) return { pakemId: fallback.id, pakemName: fallback.name, reason: 'default', score: 0 }

  return { pakemId: null, pakemName: null, reason: 'none', score: 0 }
}
