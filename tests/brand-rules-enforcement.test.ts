import { describe, it, expect } from 'vitest'
import { buildGenerationPrompt, type PersonaForPrompt, type BriefForPrompt, type HookRubricForPrompt } from '@/lib/cakgpt/prompts'
import { runRuleBasedQc } from '@/lib/cakgpt/qc-rules'
import { BrandContextSchema } from '@/lib/cakgpt/brand-context'
import type { Block } from '@/lib/cakgpt/schemas'

const persona: PersonaForPrompt = {
  name: 'Fajar Sondang', tone: 'hangat', diction_quirks: '-',
  banned_words: [], required_words: [], sample_lines: [], red_flags: [],
}
const brief: BriefForPrompt = { title: 'Nutrisi Anak', product: 'Susu', platform: 'tiktok', fields: {} }
const rubrics: HookRubricForPrompt[] = [
  { slug: 'pattern_interrupt', name: 'Pattern Interrupt', description: 'jolt', example: 'Lihat ini' },
]

const brandContext = BrandContextSchema.parse({
  profil_brand: 'AceKid — susu pertumbuhan anak.',
  cara_pengucapan: 'Dibaca "Es-Kid".',
  dilarang: 'menyembuhkan\nobat',
  wajib_gunakan: 'AceKid',
})

function build(over: Partial<Parameters<typeof buildGenerationPrompt>[0]> = {}) {
  return buildGenerationPrompt({
    persona, brief, hookRubrics: rubrics,
    platform: 'tiktok', targetDurationS: 30, aspectRatio: '9:16',
    brandContext, brandName: 'AceKid',
    ...over,
  })
}

describe('brand context in the generation prompt', () => {
  it('sits below the writer steering but above the brief', () => {
    // Authority order: the writer owns this naskah, the brand rules are a
    // standing contract, the brief is one campaign inside that contract.
    const p = build({ extraContext: 'durasi 10 detik' })
    const steeringAt = p.indexOf('WRITER STEERING')
    const brandAt = p.indexOf('BRAND RULES')
    const briefAt = p.indexOf('## STRATEGIST BRIEF')
    expect(steeringAt).toBeGreaterThan(-1)
    expect(brandAt).toBeGreaterThan(steeringAt)
    expect(briefAt).toBeGreaterThan(brandAt)
  })

  it('names the brand and states it overrides the brief', () => {
    const p = build()
    expect(p).toContain('BRAND RULES — AceKid')
    expect(p).toContain('OVERRIDE THE BRIEF')
  })

  it('carries the pronunciation rule through to the model', () => {
    expect(build()).toContain('Es-Kid')
  })

  it('states the prohibitions as absolute', () => {
    const p = build()
    expect(p).toContain('NEVER use')
    expect(p).toContain('"menyembuhkan"')
    expect(p).toContain('There is no acceptable context')
  })

  it('adds nothing when the client has no brand context', () => {
    const p = build({ brandContext: null, brandName: null })
    expect(p).not.toContain('BRAND RULES')
  })
})

function blk(text: string, id = 'b1'): Block {
  return { block_id: id, section_key: 'body', shot_no: 1, line_no: 1, speaker: null, text, visual_note: null }
}

describe('brand rules in the QC pass', () => {
  it('blocks a DILARANG word and says the rule came from the brand', () => {
    const flags = runRuleBasedQc({
      blocks: [blk('Susu ini bisa menyembuhkan batuk.')],
      bannedWords: [], requiredWords: [],
      brandBannedWords: ['menyembuhkan'], brandRequiredWords: [],
    })
    expect(flags).toHaveLength(1)
    expect(flags[0].severity).toBe('blocker')
    expect(flags[0].message).toContain('Brand rule')
    expect(flags[0].message).toContain('DILARANG')
  })

  it('blocks a missing "Wajib Gunakan Ini" word', () => {
    const flags = runRuleBasedQc({
      blocks: [blk('Halo bunda semua.')],
      bannedWords: [], requiredWords: [],
      brandBannedWords: [], brandRequiredWords: ['AceKid'],
    })
    expect(flags).toHaveLength(1)
    expect(flags[0].message).toContain('Wajib Gunakan Ini')
  })

  it('passes a naskah that obeys both lists', () => {
    const flags = runRuleBasedQc({
      blocks: [blk('AceKid bantu dukung pertumbuhan anak.')],
      bannedWords: [], requiredWords: [],
      brandBannedWords: ['menyembuhkan'], brandRequiredWords: ['AceKid'],
    })
    expect(flags).toEqual([])
  })

  it('keeps persona rules working alongside brand rules', () => {
    const flags = runRuleBasedQc({
      blocks: [blk('Ini obat paling ampuh.')],
      bannedWords: ['ampuh'], requiredWords: [],
      brandBannedWords: ['obat'], brandRequiredWords: [],
    })
    expect(flags).toHaveLength(2)
    expect(flags.some((f) => f.message.startsWith('Persona'))).toBe(true)
    expect(flags.some((f) => f.message.startsWith('Brand rule'))).toBe(true)
  })

  it('raises ONE flag when persona and brand ban the same word', () => {
    // Two identical blockers on one line read as two separate problems and
    // double the apparent QC failure count.
    const flags = runRuleBasedQc({
      blocks: [blk('Ini obat kuat.')],
      bannedWords: ['obat'], requiredWords: [],
      brandBannedWords: ['obat'], brandRequiredWords: [],
    })
    expect(flags).toHaveLength(1)
  })

  it('matches whole words only, so a ban does not fire inside a longer word', () => {
    const flags = runRuleBasedQc({
      blocks: [blk('Kami pakai bahan alami.')],
      bannedWords: [], requiredWords: [],
      brandBannedWords: ['ala'], brandRequiredWords: [],
    })
    expect(flags).toEqual([])
  })

  it('behaves exactly as before when no brand lists are passed', () => {
    const flags = runRuleBasedQc({
      blocks: [blk('Ini obat kuat.')],
      bannedWords: ['obat'], requiredWords: [],
    })
    expect(flags).toHaveLength(1)
    expect(flags[0].message).toContain('Persona')
  })
})
