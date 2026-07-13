// ============================================================
// Script Writer Studio — deterministic rule-based QC (no LLM).
// Persona banned/required words + brand guardrails → blocker flags.
// ============================================================
import { checkGuardrails } from "@/lib/guardrails";
import type { Block, QcFlagDraft, VoicePersona } from "./types";

function containsWholeWord(haystack: string, word: string): boolean {
  const w = word.trim();
  if (!w) return false;
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

/** Pass 1 — always-trusted deterministic flags. Runs with zero LLM cost. */
export function runRuleQc(opts: {
  blocks: Block[];
  persona: VoicePersona;
  guardrails: string[];
}): QcFlagDraft[] {
  const flags: QcFlagDraft[] = [];
  const banned = opts.persona.banned_words ?? [];
  const required = opts.persona.required_words ?? [];
  const fullText = opts.blocks.map((b) => b.text).join(" ");
  const firstBlockId = opts.blocks[0]?.block_id;

  // Banned words — per block.
  for (const block of opts.blocks) {
    for (const word of banned) {
      if (containsWholeWord(block.text.toLowerCase(), word.toLowerCase())) {
        flags.push({
          block_id: block.block_id,
          category: "banned_word",
          severity: "blocker",
          message: `Persona's banned word "${word}" found in this line.`,
          evidence: word,
          source: "auto_rule",
        });
      }
    }
    // Brand guardrails (prohibited phrases) — per block, blocker severity.
    const gr = checkGuardrails(block.text, opts.guardrails);
    for (const v of gr.violations) {
      flags.push({
        block_id: block.block_id,
        category: "guardrail",
        severity: "blocker",
        message: `Brand guardrail violated: "${v}".`,
        evidence: v,
        source: "auto_rule",
      });
    }
  }

  // Required words — whole-document presence check, attached to the first block.
  if (firstBlockId) {
    for (const word of required) {
      if (!containsWholeWord(fullText.toLowerCase(), word.toLowerCase())) {
        flags.push({
          block_id: firstBlockId,
          category: "brief_adherence",
          severity: "blocker",
          message: `Persona's required word "${word}" is missing from the whole naskah.`,
          evidence: word,
          source: "auto_rule",
        });
      }
    }
  }

  return flags;
}
