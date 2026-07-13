// ============================================================
// Script Writer Studio — naskah generation (1 LLM call per script).
// Uses the ecosystem's unified runLLM + the brand voice/guardrails +
// the persona voice profile. Writes sw_naskah + sw_naskah_versions +
// sw_qc_flags. Brand-scoped (no RLS).
// ============================================================
import { admin } from "@/lib/supabase";
import { runLLM, extractJson } from "@/lib/llm";
import type { Brand } from "@/lib/types";
import { runRuleQc } from "./qc";
import type { Block, VoicePersona, QcFlagDraft } from "./types";

function blockId(): string {
  return globalThis.crypto.randomUUID().slice(0, 12);
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : v == null ? fallback : String(v);
}
function posInt(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? Math.floor(v) : parseInt(String(v), 10);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

/** Coerce the model's JSON body into clean Block[] with server-assigned ids. */
function normalizeBlocks(raw: unknown): Block[] {
  const arr = Array.isArray(raw) ? raw : [];
  const blocks: Block[] = [];
  for (let i = 0; i < arr.length && i < 60; i++) {
    const b = (arr[i] && typeof arr[i] === "object" ? arr[i] : {}) as Record<string, unknown>;
    const text = str(b.text).slice(0, 2000);
    if (!text.trim()) continue;
    blocks.push({
      block_id: blockId(),
      section_key: (str(b.section_key).trim() || "body").slice(0, 60),
      shot_no: posInt(b.shot_no, i + 1),
      line_no: posInt(b.line_no, 1),
      speaker: typeof b.speaker === "string" ? b.speaker.slice(0, 60) : null,
      timestamp_range: typeof b.timestamp_range === "string" ? b.timestamp_range.slice(0, 30) : null,
      text,
      visual_note: typeof b.visual_note === "string" ? b.visual_note.slice(0, 500) : null,
    });
  }
  return blocks;
}

function fieldLookup(fields: Record<string, unknown>, re: RegExp): string | null {
  for (const [k, v] of Object.entries(fields || {})) {
    if (re.test(k) && v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

/** Scannable title: "W3·D2 · Topic · Persona". */
export function composeTitle(brief: { title: string; fields: Record<string, unknown> }, personaName: string): string {
  const f = brief.fields || {};
  const topic = fieldLookup(f, /\b(topic|topik|tema|subject)\b/i) || brief.title;
  const week = fieldLookup(f, /\b(week|minggu|pekan)\b/i)?.match(/\d+/)?.[0];
  const day = fieldLookup(f, /\b(day|hari)\b/i)?.match(/\d+/)?.[0];
  const prefix = [week ? `W${week}` : "", day ? `D${day}` : ""].filter(Boolean).join("·");
  return [prefix, topic, personaName].filter(Boolean).join(" · ");
}

function buildSystem(brand: Brand, persona: VoicePersona): string {
  const lines = [
    "You are an expert short-form video scriptwriter for an Indonesian UGC marketing agency.",
    "Write a naskah (script) in Bahasa Indonesia, shot-by-shot, strictly in the persona's voice and serving the brief.",
    "",
    `## BRAND: ${brand.name}`,
    brand.campaign_tagline ? `Tagline: ${brand.campaign_tagline}` : "",
    brand.guidelines ? `Guidelines: ${brand.guidelines}` : "",
    brand.cta_rules ? `CTA rules: ${brand.cta_rules}` : "",
    brand.approved_claims?.length ? `Approved claims (only these are safe to assert): ${brand.approved_claims.join("; ")}` : "",
    brand.guardrails?.length ? `PROHIBITED — never write these phrases/claims: ${brand.guardrails.join("; ")}` : "",
    "",
    `## PERSONA: ${persona.name}`,
    persona.archetype ? `Archetype: ${persona.archetype}` : "",
    persona.tone_of_voice ? `Tone of voice: ${persona.tone_of_voice}` : "",
    persona.banned_words?.length ? `Banned words (never use): ${persona.banned_words.join(", ")}` : "",
    persona.required_words?.length ? `Required words (use naturally): ${persona.required_words.join(", ")}` : "",
    persona.gold_examples?.length ? `Voice reference (match this style):\n- ${persona.gold_examples.slice(0, 4).join("\n- ")}` : "",
    "",
    "## OUTPUT — respond with ONLY this JSON shape:",
    '{ "hook_type": string, "hook_justification": string,',
    '  "format_meta": { "platform": string, "target_duration_s": number, "aspect_ratio": string },',
    '  "body": [ { "section_key": "hook|body|cta", "shot_no": number, "line_no": number, "speaker": string|null, "timestamp_range": string|null, "text": string, "visual_note": string|null } ] }',
    "Number shot_no/line_no sequentially from 1. Keep the hook in the first shot. Do not include any prohibited phrase.",
  ];
  return lines.filter(Boolean).join("\n");
}

function buildPrompt(brief: { title: string; product: string | null; platform: string | null; fields: Record<string, unknown> }): string {
  const fieldLines = Object.entries(brief.fields || {}).map(([k, v]) => `- ${k}: ${String(v)}`).join("\n") || "(no extra fields)";
  return [
    "## BRIEF (unknown field keys are freeform context, not schema violations)",
    `Title: ${brief.title}`,
    brief.product ? `Product: ${brief.product}` : "",
    `Platform: ${brief.platform || "tiktok"}`,
    fieldLines,
    "",
    "Write the full naskah now as JSON.",
  ].filter(Boolean).join("\n");
}

export interface GenerateResult {
  ok: boolean;
  naskahId?: string;
  error?: string;
}

/** Generate one naskah for a (brief × persona) pair. skipCritic=true (bulk) runs
 *  only the deterministic rule QC; the LLM critic is available on demand. */
export async function generateNaskah(opts: {
  brandId: string;
  batchId: string;
  briefId: string;
  personaId?: string | null;
  skipCritic?: boolean;
}): Promise<GenerateResult> {
  const db = admin();

  const { data: brief } = await db.from("sw_briefs").select("*").eq("id", opts.briefId).eq("brand_id", opts.brandId).single();
  if (!brief) return { ok: false, error: "brief not found" };

  const personaId = opts.personaId || brief.persona_id;
  if (!personaId) return { ok: false, error: "no persona specified (brief has no default persona)" };

  const { data: persona } = await db.from("personas").select("*").eq("id", personaId).eq("brand_id", opts.brandId).single();
  if (!persona) return { ok: false, error: "persona not found" };

  const { data: brand } = await db.from("brands").select("*").eq("id", opts.brandId).single();
  if (!brand) return { ok: false, error: "brand not found" };

  const b = brand as Brand;
  const p = persona as VoicePersona;
  const briefRow = brief as { title: string; product: string | null; platform: string | null; fields: Record<string, unknown> };

  let blocks: Block[];
  let hookType = "";
  let hookJust = "";
  let formatMeta: Record<string, unknown> = { platform: briefRow.platform || "tiktok", target_duration_s: 30, aspect_ratio: "9:16" };
  try {
    const res = await runLLM({
      system: buildSystem(b, p),
      prompt: buildPrompt(briefRow),
      json: true,
      temperature: 0.8,
      maxTokens: 4096,
    });
    const parsed = extractJson<Record<string, unknown>>(res.text);
    blocks = normalizeBlocks(parsed.body);
    if (blocks.length === 0) return { ok: false, error: "generation returned no usable blocks" };
    hookType = str(parsed.hook_type).slice(0, 80);
    hookJust = str(parsed.hook_justification).slice(0, 1000);
    if (parsed.format_meta && typeof parsed.format_meta === "object") formatMeta = parsed.format_meta as Record<string, unknown>;
  } catch (e) {
    return { ok: false, error: `generation failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  // Create the naskah identity row, then its first version atomically.
  const { data: naskahRow, error: nErr } = await db
    .from("sw_naskah")
    .insert({
      brand_id: opts.brandId,
      batch_id: opts.batchId,
      brief_id: opts.briefId,
      persona_id: personaId,
      title: composeTitle(briefRow, p.name),
      status: "draft",
      source: "generated",
    })
    .select("id")
    .single();
  if (nErr || !naskahRow) return { ok: false, error: `failed to create naskah: ${nErr?.message}` };

  const { data: version, error: vErr } = await db.rpc("sw_create_naskah_version", {
    p_naskah_id: naskahRow.id,
    p_body: blocks,
    p_hook_type: hookType,
    p_hook_justification: hookJust,
    p_format_meta: formatMeta,
    p_generation_meta: { persona_snapshot: { id: p.id, name: p.name }, brief_fields: briefRow.fields },
    p_created_via: "ai_generation",
    p_change_summary: null,
  });
  if (vErr || !version) return { ok: false, error: `failed to create version: ${vErr?.message}` };

  await runAndInsertQc({ naskahId: naskahRow.id, versionId: version.id, blocks, persona: p, brand: b, skipCritic: opts.skipCritic });
  return { ok: true, naskahId: naskahRow.id };
}

/** Insert rule-based QC (always) and, unless skipCritic, an LLM critic pass. */
export async function runAndInsertQc(opts: {
  naskahId: string;
  versionId: string;
  blocks: Block[];
  persona: VoicePersona;
  brand: Brand;
  skipCritic?: boolean;
}): Promise<{ blocker: number; warning: number; nit: number }> {
  const db = admin();
  const blockById = new Map(opts.blocks.map((b) => [b.block_id, b]));
  const drafts: QcFlagDraft[] = runRuleQc({ blocks: opts.blocks, persona: opts.persona, guardrails: opts.brand.guardrails ?? [] });

  if (!opts.skipCritic) {
    try {
      const critic = await runCritic(opts.blocks, opts.persona, opts.brand);
      for (const c of critic) {
        if (!blockById.has(c.block_id)) continue;
        drafts.push({ ...c, severity: c.severity === "blocker" ? "warning" : c.severity }); // only rule flags may be blocker
      }
    } catch {
      // critic is best-effort; rule flags already stand.
    }
  }

  if (drafts.length > 0) {
    await db.from("sw_qc_flags").insert(
      drafts.map((f) => {
        const blk = blockById.get(f.block_id)!;
        return {
          naskah_id: opts.naskahId,
          naskah_version_id: opts.versionId,
          target_ref: { block_id: f.block_id, display_snapshot: { section_key: blk.section_key, shot_no: blk.shot_no, line_no: blk.line_no } },
          category: f.category,
          severity: f.severity,
          message: f.message,
          evidence: f.evidence ? { value: f.evidence } : null,
          source: f.source,
        };
      }),
    );
  }

  const counts = { blocker: 0, warning: 0, nit: 0 };
  for (const f of drafts) counts[f.severity]++;
  return counts;
}

/** Pass 2 — adversarial LLM critic (persona/brief/generic issues). */
async function runCritic(blocks: Block[], persona: VoicePersona, brand: Brand): Promise<QcFlagDraft[]> {
  const bodyLines = blocks.map((b) => `[block_id=${b.block_id}] (${b.section_key}/${b.shot_no}.${b.line_no}): ${b.text}`).join("\n");
  const res = await runLLM({
    system: [
      "You are an adversarial QC critic for a short-form video naskah. You did NOT write it — find what's wrong. Be skeptical.",
      `Persona: ${persona.name}. Tone: ${persona.tone_of_voice ?? "(n/a)"}.`,
      `Brand: ${brand.name}. Guidelines: ${brand.guidelines ?? "(n/a)"}.`,
      "Flag categories: brief_adherence, persona_voice_deviation, generic_phrasing (AI-sounding/cliché).",
      'Respond ONLY as JSON: { "flags": [ { "block_id": string (must be an EXISTING id), "category": string, "severity": "warning"|"nit", "message": string, "evidence": string|null } ] }.',
      "Return an empty flags array if there are no real issues — do not invent flags.",
    ].join("\n"),
    prompt: `Critique this naskah (reference existing block_ids only):\n${bodyLines}`,
    json: true,
    temperature: 0.4,
    maxTokens: 2048,
  });
  const parsed = extractJson<{ flags?: unknown }>(res.text);
  const flags = Array.isArray(parsed.flags) ? parsed.flags : [];
  const out: QcFlagDraft[] = [];
  for (const raw of flags) {
    const f = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const cat = str(f.category);
    const category = (["brief_adherence", "persona_voice_deviation", "generic_phrasing"].includes(cat) ? cat : "generic_phrasing") as QcFlagDraft["category"];
    const sev = str(f.severity);
    out.push({
      block_id: str(f.block_id),
      category,
      severity: sev === "nit" ? "nit" : "warning",
      message: str(f.message).slice(0, 500),
      evidence: typeof f.evidence === "string" ? f.evidence.slice(0, 500) : null,
      source: "auto_llm",
    });
  }
  return out;
}
