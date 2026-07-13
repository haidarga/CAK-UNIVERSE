import type { Block } from '@/lib/cakgpt/schemas'

export type RuleFlagDraft = {
  block_id: string
  category: 'banned_word' | 'brief_adherence'
  severity: 'blocker' | 'warning' | 'nit'
  message: string
  evidence?: string
}

// Pass 1 (ARCHITECTURE.md §5) — deterministic, no LLM call. Runs before the
// critic pass so blocker-tier flags never depend on model behavior.
export function runRuleBasedQc(opts: {
  blocks: Block[]
  bannedWords: string[]
  requiredWords: string[]
}): RuleFlagDraft[] {
  const flags: RuleFlagDraft[] = []
  const fullText = opts.blocks.map((b) => b.text).join(' ').toLowerCase()

  for (const block of opts.blocks) {
    const lower = block.text.toLowerCase()
    for (const word of opts.bannedWords) {
      if (!word.trim()) continue
      if (containsWholeWord(lower, word.toLowerCase())) {
        flags.push({
          block_id: block.block_id,
          category: 'banned_word',
          severity: 'blocker',
          message: `Persona's banned word "${word}" found in this line.`,
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
    for (const word of opts.requiredWords) {
      if (!word.trim()) continue
      if (!containsWholeWord(fullText, word.toLowerCase())) {
        flags.push({
          block_id: firstBlockId,
          category: 'brief_adherence',
          severity: 'blocker',
          message: `Persona's required word "${word}" is missing from the whole naskah.`,
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
