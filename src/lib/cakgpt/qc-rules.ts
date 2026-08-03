import type { Block } from '@/lib/cakgpt/schemas'

export type RuleFlagDraft = {
  block_id: string
  category: 'banned_word' | 'brief_adherence'
  severity: 'blocker' | 'warning' | 'nit'
  message: string
  evidence?: string
}

// Where a rule came from. Surfaced in the flag message because the fix differs:
// a persona word is edited on the persona, a brand word on the client's Brand &
// Market Context — and "banned word" with no owner sends the writer hunting.
type RuleSource = 'persona' | 'brand'

// Pass 1 (ARCHITECTURE.md §5) — deterministic, no LLM call. Runs before the
// critic pass so blocker-tier flags never depend on model behavior.
export function runRuleBasedQc(opts: {
  blocks: Block[]
  bannedWords: string[]
  requiredWords: string[]
  // The client's Brand & Market Context lists (DILARANG / Wajib Gunakan Ini).
  // Optional so every existing caller keeps working unchanged.
  brandBannedWords?: string[]
  brandRequiredWords?: string[]
}): RuleFlagDraft[] {
  const flags: RuleFlagDraft[] = []
  const fullText = opts.blocks.map((b) => b.text).join(' ').toLowerCase()

  const banned: Array<{ word: string; source: RuleSource }> = [
    ...opts.bannedWords.map((word) => ({ word, source: 'persona' as const })),
    ...(opts.brandBannedWords || []).map((word) => ({ word, source: 'brand' as const })),
  ]
  const required: Array<{ word: string; source: RuleSource }> = [
    ...opts.requiredWords.map((word) => ({ word, source: 'persona' as const })),
    ...(opts.brandRequiredWords || []).map((word) => ({ word, source: 'brand' as const })),
  ]

  for (const block of opts.blocks) {
    const lower = block.text.toLowerCase()
    // A word banned by BOTH the persona and the brand would otherwise raise two
    // identical flags on the same line, which reads as two separate problems.
    const seen = new Set<string>()
    for (const { word, source } of banned) {
      if (!word.trim()) continue
      const key = word.toLowerCase()
      if (seen.has(key)) continue
      if (containsWholeWord(lower, key)) {
        seen.add(key)
        flags.push({
          block_id: block.block_id,
          category: 'banned_word',
          severity: 'blocker',
          message: source === 'brand'
            ? `Brand rule: "${word}" is on the client's DILARANG list and must not appear.`
            : `Persona's banned word "${word}" found in this line.`,
          evidence: word,
        })
      }
    }
  }

  // Required words are checked across the whole naskah, not per-line — attach
  // to the first block as a whole-document flag since there's no single line
  // that's "missing" a word.
  const firstBlockId = opts.blocks[0]?.block_id
  if (firstBlockId) {
    const seen = new Set<string>()
    for (const { word, source } of required) {
      if (!word.trim()) continue
      const key = word.toLowerCase()
      if (seen.has(key)) continue
      if (!containsWholeWord(fullText, key)) {
        seen.add(key)
        flags.push({
          block_id: firstBlockId,
          category: 'brief_adherence',
          severity: 'blocker',
          message: source === 'brand'
            ? `Brand rule: "${word}" is on the client's "Wajib Gunakan Ini" list but never appears.`
            : `Persona's required word "${word}" is missing from the whole naskah.`,
          evidence: word,
        })
      }
    }
  }

  return flags
}

function containsWholeWord(haystack: string, word: string): boolean {
  if (!word) return false
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack)
}
