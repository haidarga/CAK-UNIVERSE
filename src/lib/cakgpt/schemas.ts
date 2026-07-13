import { z } from 'zod'

// Runtime validation for every LLM call boundary (ARCHITECTURE.md §0 — compile-time
// types alone are not enough, model output must be verified, never trusted).

export const BlockInputSchema = z.object({
  section_key: z.string().min(1).max(60),
  shot_no: z.number().int().min(1),
  line_no: z.number().int().min(1),
  speaker: z.string().max(60).nullable().optional(),
  timestamp_range: z.string().max(30).nullable().optional(),
  text: z.string().min(1).max(2000),
  visual_note: z.string().max(500).nullable().optional(),
})
export type BlockInput = z.infer<typeof BlockInputSchema>

// A persisted block always carries its permanent, server-assigned block_id.
export const BlockSchema = BlockInputSchema.extend({
  block_id: z.string().min(1),
})
export type Block = z.infer<typeof BlockSchema>

export const FormatMetaSchema = z.object({
  platform: z.string().min(1).max(40),
  target_duration_s: z.number().int().min(3).max(600),
  aspect_ratio: z.string().max(10),
})

export const GenerationOutputSchema = z.object({
  hook_type: z.string().min(1),
  hook_justification: z.string().min(1).max(1000),
  format_meta: FormatMetaSchema,
  body: z.array(BlockInputSchema).min(1).max(60),
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
export const GenerateBatchItemSchema = z.object({
  brief_id: z.string().uuid(),
  persona_id: z.string().uuid().nullable().optional(),
})
export type GenerateBatchItem = z.infer<typeof GenerateBatchItemSchema>

export const GenerateBatchBodySchema = z.object({
  // Generation is now background jobs (enqueue → drain in chunks), so a big
  // fan-out (e.g. 100 briefs × 9 personas = 900) is fine — the old max:200 was a
  // leftover from the synchronous design and rejected large Import & Generate runs.
  items: z.array(GenerateBatchItemSchema).min(1).max(4000),
})

// ── Brief import / extraction (content plan file → many briefs) ─────────────
// Raw LLM output. `fields` is an array of {key,value} pairs (not a map) because
// Gemini's responseSchema can't express arbitrary object keys — the extract
// layer converts it to a Record before it reaches the UI/commit.
export const ExtractedBriefRawSchema = z.object({
  title: z.string().min(1).max(200),
  product: z.string().max(200).nullable().optional(),
  platform: z.string().max(40).nullable().optional(),
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
  // Key schema constrained (non-empty, ≤80) + key-count capped so /commit — a
  // standalone write path — can't smuggle a huge fields object past the caps the
  // extraction schema (ExtractedBriefRawSchema) enforces.
  fields: z.record(z.string().min(1).max(80), z.string().max(2000))
    .refine((f) => Object.keys(f).length <= 30, { message: 'too many fields (max 30)' })
    .default({}),
})
export type ImportBrief = z.infer<typeof ImportBriefSchema>

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
