import { z } from 'zod'

// Runtime validation for every LLM call boundary (ARCHITECTURE.md §0 — compile-time
// types alone are not enough, model output must be verified, never trusted).

export const BlockInputSchema = z.object({
  section_key: z.string().min(1).max(80),
  shot_no: z.coerce.number().int().min(1),
  line_no: z.coerce.number().int().min(1),
  speaker: z.string().max(100).nullable().optional(),
  timestamp_range: z.string().max(100).nullable().optional(),
  location: z.string().max(1000).nullable().optional(),
  wardrobe: z.string().max(1000).nullable().optional(),
  text: z.string().max(4000).default(''),
  visual_note: z.string().max(1500).nullable().optional(),
})
export type BlockInput = z.infer<typeof BlockInputSchema>

// A persisted block always carries its permanent, server-assigned block_id.
export const BlockSchema = BlockInputSchema.extend({
  block_id: z.string().min(1),
})
export type Block = z.infer<typeof BlockSchema>

export const FormatMetaSchema = z.object({
  platform: z.string().min(1).max(60),
  target_duration_s: z.coerce.number().int().min(1).max(1800),
  aspect_ratio: z.string().max(20),
})

export const GenerationOutputSchema = z.object({
  hook_type: z.string().default('pattern_interrupt'),
  hook_justification: z.string().max(3000).default(''),
  format_meta: FormatMetaSchema,
  body: z.array(BlockInputSchema).min(1).max(100),
})
export type GenerationOutput = z.infer<typeof GenerationOutputSchema>

export const QcCategory = z.enum(['brief_adherence', 'persona_voice_deviation', 'generic_phrasing', 'banned_word'])
export const QcSeverity = z.enum(['blocker', 'warning', 'nit'])

export const CriticFlagSchema = z.object({
  block_id: z.string().min(1),
  category: QcCategory,
  severity: QcSeverity,
  message: z.string().min(1).max(500),
  evidence: z.string().max(500).nullable().optional(),
})
export type CriticFlag = z.infer<typeof CriticFlagSchema>

export const CriticOutputSchema = z.object({
  flags: z.array(CriticFlagSchema).max(100),
})

export const IdeaAngleSchema = z.object({
  angle_no: z.number().int().min(1),
  hook_slug: z.string().min(1),
  hook_label: z.string().min(1).max(80),
  one_liner: z.string().min(1).max(300),
  why_it_works: z.string().min(1).max(500),
})
export type IdeaAngle = z.infer<typeof IdeaAngleSchema>

export const IdeaOutputSchema = z.object({
  angles: z.array(IdeaAngleSchema).min(1).max(12),
})

// Bulk fan-out request (decision #2): one item = one (brief × persona) pair to
// generate. persona_id omitted/null falls back to the brief's default persona
// inside generateNaskah(). The client multiplies briefs × personas client-side.
// Shared so the UI's clamp and the server's validation can never drift apart —
// these were previously duplicated as bare literals in both components.
export const MAX_DAY_TOTAL = 30
export const MAX_FANOUT_ITEMS = 4000

export const GenerateBatchItemSchema = z.object({
  brief_id: z.string().uuid(),
  persona_id: z.string().uuid().nullable().optional(),
  // Optional writer steering ("arahan") applied to this fan-out item — shapes
  // how the naskah turns out. Empty/omitted = plain direct generate.
  extra_context: z.string().max(4000).nullable().optional(),
  // Content format ("tipe konten") for this naskah — a preset key
  // ('talking_head', 'vlog', …) or free text the writer invented. Unlike
  // extra_context this is a LOCKED constraint, not a hint: format asked for as
  // steering prose was reliably ignored, which is why it has its own field.
  content_format: z.string().max(120).nullable().optional(),
  // Which Script Pakem (brand house structure) to build this naskah against.
  pakem_id: z.string().uuid().nullable().optional(),
  // Multi-day fan-out: which day of how many this naskah is for. Both null
  // (the default) = the original one-naskah-per-(brief x persona) behavior.
  // Capped so one click can't quietly enqueue a month-per-topic run.
  day_no: z.number().int().min(1).max(MAX_DAY_TOTAL).nullable().optional(),
  day_total: z.number().int().min(1).max(MAX_DAY_TOTAL).nullable().optional(),
})
  // This route is a trust boundary, not just a UI callee: validate the pair is
  // coherent instead of assuming a well-behaved client. Half a pair (or
  // day_no > day_total) would otherwise persist a row that the title/prompt
  // guards silently treat as single-day — the day would be stored but never
  // rendered, so the naskah looks mislabeled everywhere downstream.
  .refine((it) => (it.day_no == null) === (it.day_total == null), {
    message: 'day_no and day_total must be set together',
  })
  .refine((it) => it.day_no == null || it.day_total == null || it.day_no <= it.day_total, {
    message: 'day_no must not exceed day_total',
  })
export type GenerateBatchItem = z.infer<typeof GenerateBatchItemSchema>

export const GenerateBatchBodySchema = z.object({
  // Generation is now background jobs (enqueue → drain in chunks), so a big
  // fan-out (e.g. 100 briefs × 9 personas = 900) is fine — the old max:200 was a
  // leftover from the synchronous design and rejected large Import & Generate runs.
  items: z.array(GenerateBatchItemSchema).min(1).max(MAX_FANOUT_ITEMS),
})

// ── Brief import / extraction (content plan file → many briefs) ─────────────
// Raw LLM output. `fields` is an array of {key,value} pairs (not a map) because
// Gemini's responseSchema can't express arbitrary object keys — the extract
// layer converts it to a Record before it reaches the UI/commit.
export const ExtractedBriefRawSchema = z.object({
  title: z.string().min(1).max(200),
  product: z.string().max(200).nullable().optional(),
  platform: z.string().max(40).nullable().optional(),
  // Best-effort audience-segment tag (e.g. "Nutrition Mom", "Dad Persona") —
  // null when the source gives no clear signal. Steered toward the caller's
  // EXISTING persona cluster names (see buildBriefExtractionPrompt) so this
  // lines up with sw_personas.cluster instead of inventing new vocabulary.
  cluster: z.string().max(80).nullable().optional(),
  fields: z.array(z.object({ key: z.string().min(1).max(80), value: z.string().max(2000) })).max(30).default([]),
})
export const BriefExtractionOutputSchema = z.object({
  briefs: z.array(ExtractedBriefRawSchema).max(300),
})

// A brief ready to commit (fields already normalized to a Record). This is what
// the preview UI sends back after the writer reviews/edits the extraction.
export const ImportBriefSchema = z.object({
  title: z.string().min(1).max(200),
  product: z.string().max(200).nullable().optional(),
  platform: z.string().max(40).nullable().optional(),
  cluster: z.string().max(80).nullable().optional(),
  // Key schema constrained (non-empty, ≤80) + key-count capped so /commit — a
  // standalone write path — can't smuggle a huge fields object past the caps the
  // extraction schema (ExtractedBriefRawSchema) enforces.
  fields: z.record(z.string().min(1).max(80), z.string().max(2000))
    .refine((f) => Object.keys(f).length <= 30, { message: 'too many fields (max 30)' })
    .default({}),
})
export type ImportBrief = z.infer<typeof ImportBriefSchema>

// ── Hook bank import (the writer's own ready-made opening lines) ────────────
// Each hook carries the audience cluster it was filed under, because the bank
// is a POOL to draw from per persona — a Dad persona must not open with a hook
// written for Working Moms. Hook banks are grouped by cluster in the source
// file; cluster is null only when a line sits outside any group.
export const HookBankItemSchema = z.object({
  cluster: z.string().max(80).nullable().optional(),
  text: z.string().min(1).max(400),
})
export type HookBankItem = z.infer<typeof HookBankItemSchema>

export const HookBankOutputSchema = z.object({
  hooks: z.array(HookBankItemSchema).max(300),
})

// Upper bound carried into the batch — a bank far larger than this would blow
// up every generation prompt (it is injected per naskah).
export const MAX_HOOK_BANK = 300

// How many files one import may carry (content plan + hook bank, plus a little
// headroom for a plan split in two). Shared so the client refuses the extra
// files BEFORE uploading them, instead of the server silently dropping the tail.
export const MAX_SOURCES = 4

export const ImportCommitSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'ready']).default('ready'),
  import_label: z.string().max(200).optional(), // groups these briefs by content plan
  briefs: z.array(ImportBriefSchema).min(1).max(300),
})

// ── Naskah import (existing finished scripts in docx/pdf/text → naskah rows) ──
// One source document can hold MANY naskah (split by heading). Each naskah is
// mapped into shot-by-shot blocks WITHOUT rewriting the writer's words. Blocks
// have no block_id yet — the commit route assigns them server-side.
export const ImportedNaskahSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.array(BlockInputSchema).min(1).max(80),
})
export type ImportedNaskah = z.infer<typeof ImportedNaskahSchema>

export const NaskahExtractionOutputSchema = z.object({
  naskah: z.array(ImportedNaskahSchema).min(1).max(40),
})

export const NaskahImportCommitSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  persona_id: z.string().uuid(), // required — the imported script's voice, also what Auto-QC checks against
  batch_name: z.string().max(120).optional(),
  naskah: z.array(ImportedNaskahSchema).min(1).max(40),
})

// ── Content Translator (image/video → creative direction) ──
// One reference image or video (a competitor post/thumbnail/screenshot/clip)
// mapped into a structured creative direction a writer can reuse: what makes
// it work, and how to steer a NEW naskah toward the same technique for a
// different brand. Caps sized generously — video has genuinely more to
// describe (motion, cuts, multiple shots) than a single still frame, and
// these are prose fields for on-screen display, not IDs/keys.
export const ShotBreakdownItemSchema = z.object({
  shot_no: z.number().int().min(1),
  description: z.string().min(1).max(500),
  camera_angle: z.string().max(150).nullable().optional(),
})
export const VisualDirectionSchema = z.object({
  hook_type: z.string().min(1).max(120),
  hook_description: z.string().min(1).max(800),
  visual_style: z.string().min(1).max(800),
  pacing: z.string().min(1).max(400),
  mood: z.string().min(1).max(300),
  target_audience_read: z.string().min(1).max(500),
  cta_style: z.string().max(400).nullable().optional(),
  notable_techniques: z.array(z.string().min(1).max(250)).max(10).default([]),
  shot_breakdown: z.array(ShotBreakdownItemSchema).max(30).default([]),
  suggested_angle_for_reuse: z.string().min(1).max(800),
})
export type VisualDirection = z.infer<typeof VisualDirectionSchema>
