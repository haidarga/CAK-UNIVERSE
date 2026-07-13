// ============================================================
// Script Writer Studio (CAKGPT port) — shared types.
// Block-based naskah body, brief import shapes, QC flags.
// ============================================================

/** One content block inside a naskah version body. block_id is server-assigned
 *  and permanent (QC flags point at it). */
export interface Block {
  block_id: string;
  section_key: string;
  shot_no: number;
  line_no: number;
  speaker?: string | null;
  timestamp_range?: string | null;
  text: string;
  visual_note?: string | null;
}

export interface FormatMeta {
  platform: string;
  target_duration_s: number;
  aspect_ratio: string;
}

/** A brief extracted from a content plan (fields already normalized to a map). */
export interface ImportedBrief {
  title: string;
  product?: string | null;
  platform?: string | null;
  fields: Record<string, string>;
}

/** A finished naskah split out of an existing document (import). */
export interface ImportedNaskah {
  title: string;
  body: Block[];
}

export type QcCategory =
  | "brief_adherence"
  | "persona_voice_deviation"
  | "generic_phrasing"
  | "banned_word"
  | "guardrail";
export type QcSeverity = "blocker" | "warning" | "nit";

export interface QcFlagDraft {
  block_id: string;
  category: QcCategory;
  severity: QcSeverity;
  message: string;
  evidence?: string | null;
  source: "auto_rule" | "auto_llm";
}

/** Persona row extended with CAKGPT voice fields (migration 009). */
export interface VoicePersona {
  id: string;
  name: string;
  archetype?: string | null;
  tone_of_voice?: string | null;
  voice_tone?: Record<string, unknown> | null;
  diction_quirks?: unknown;
  banned_words?: string[] | null;
  required_words?: string[] | null;
  sample_lines?: unknown;
  red_flags?: unknown;
  gold_examples?: string[] | null;
  language?: string | null;
}
