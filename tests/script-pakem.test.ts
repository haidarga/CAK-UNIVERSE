import { describe, it, expect } from 'vitest'
import {
  PakemStructureSchema,
  EMPTY_PAKEM,
  parsePakemStructure,
  isPakemEmpty,
  parseExtraRules,
  formatShotRange,
  detectPakemFormatClash,
  pakemSection,
  type PakemStructure,
} from '@/lib/cakgpt/script-pakem'

const full: PakemStructure = {
  section_flow: ['hook', 'masalah', 'solusi', 'bukti', 'cta'],
  shot_min: 5,
  shot_max: 7,
  hook_style: 'Buka dengan pertanyaan yang bikin ibu berhenti scroll.',
  cta_style: 'CTA lembut, ajak cek komposisi — bukan suruh beli.',
  pacing: 'Kalimat pendek, maksimal 12 kata per baris.',
  extra_rules: 'Sebut nama anak minimal sekali\nJangan pakai angka statistik',
  detected_format: 'talking_head',
  voice_sample: 'Bunda, coba cek deh label susunya.',
}

describe('PakemStructureSchema', () => {
  it('defaults every field so a partial AI extraction still saves', () => {
    const p = PakemStructureSchema.parse({ hook_style: 'X' })
    expect(p.section_flow).toEqual([])
    expect(p.shot_min).toBeNull()
    expect(p.extra_rules).toBe('')
  })

  it('coerces a numeric string, which is what a number input sends', () => {
    expect(PakemStructureSchema.parse({ shot_min: '5' }).shot_min).toBe(5)
  })

  it('rejects an out-of-range shot count instead of storing it', () => {
    expect(() => PakemStructureSchema.parse({ shot_min: 0 })).toThrow()
    expect(() => PakemStructureSchema.parse({ shot_max: 500 })).toThrow()
  })
})

describe('isPakemEmpty / parsePakemStructure', () => {
  it('treats a blank pakem as absent', () => {
    expect(isPakemEmpty(EMPTY_PAKEM)).toBe(true)
    expect(isPakemEmpty(null)).toBe(true)
    expect(parsePakemStructure({})).toBeNull()
  })

  it('is not empty once any single field is set', () => {
    expect(isPakemEmpty({ ...EMPTY_PAKEM, shot_min: 3 })).toBe(false)
    expect(isPakemEmpty({ ...EMPTY_PAKEM, hook_style: 'X' })).toBe(false)
  })

  it('never throws on a malformed stored value', () => {
    // A row written before a schema change must not be able to fail generation.
    expect(parsePakemStructure(null)).toBeNull()
    expect(parsePakemStructure('nope')).toBeNull()
    expect(parsePakemStructure({ shot_min: 'abc' })).toBeNull()
  })
})

describe('parseExtraRules', () => {
  it('splits one rule per line and strips bullets', () => {
    expect(parseExtraRules('- satu\n• dua\n\n  tiga  ')).toEqual(['satu', 'dua', 'tiga'])
  })

  it('is empty for nothing', () => {
    expect(parseExtraRules('')).toEqual([])
    expect(parseExtraRules(null)).toEqual([])
  })
})

describe('formatShotRange', () => {
  it('renders a range, a single value, and open ends', () => {
    expect(formatShotRange({ ...EMPTY_PAKEM, shot_min: 5, shot_max: 7 })).toBe('5-7 shot')
    expect(formatShotRange({ ...EMPTY_PAKEM, shot_min: 6, shot_max: 6 })).toBe('6 shot')
    expect(formatShotRange({ ...EMPTY_PAKEM, shot_min: 4, shot_max: null })).toBe('minimal 4 shot')
    expect(formatShotRange({ ...EMPTY_PAKEM, shot_min: null, shot_max: 9 })).toBe('maksimal 9 shot')
  })

  it('is null when the writer left it unconstrained', () => {
    expect(formatShotRange(EMPTY_PAKEM)).toBeNull()
  })
})

describe('detectPakemFormatClash', () => {
  it('warns when the pakem and the ticked format disagree', () => {
    const r = detectPakemFormatClash(full, ['vlog'])
    expect(r?.clash).toBe(true)
    expect(r?.message).toContain('talking_head')
    expect(r?.message).toContain('vlog')
  })

  it('says nothing when they agree', () => {
    expect(detectPakemFormatClash(full, ['talking_head'])).toBeNull()
  })

  it('says nothing when no format was ticked', () => {
    expect(detectPakemFormatClash(full, [])).toBeNull()
  })

  it('says nothing when the pakem has no detected format', () => {
    expect(detectPakemFormatClash({ ...full, detected_format: null }, ['vlog'])).toBeNull()
  })

  it('tolerates underscore vs space spelling', () => {
    expect(detectPakemFormatClash({ ...full, detected_format: 'talking head' }, ['talking_head'])).toBeNull()
  })

  it('does not warn when the matching format is one of several ticked', () => {
    expect(detectPakemFormatClash(full, ['vlog', 'talking_head'])).toBeNull()
  })
})

describe('pakemSection', () => {
  it('is empty when there is no pakem', () => {
    expect(pakemSection(null)).toBe('')
    expect(pakemSection(EMPTY_PAKEM)).toBe('')
  })

  it('states that the shape comes from here and the topic from the brief', () => {
    const s = pakemSection(full, 'Pakem Edukasi')
    expect(s).toContain('SCRIPT PAKEM — Pakem Edukasi')
    expect(s).toContain('the topic comes')
  })

  it('injects the beat order as section keys', () => {
    expect(pakemSection(full)).toContain('hook -> masalah -> solusi -> bukti -> cta')
  })

  it('injects the shot range the writer set', () => {
    expect(pakemSection(full)).toContain('5-7 shot')
  })

  it('injects hook, CTA and pacing rules', () => {
    const s = pakemSection(full)
    expect(s).toContain('berhenti scroll')
    expect(s).toContain('bukan suruh beli')
    expect(s).toContain('maksimal 12 kata')
  })

  it('injects each extra rule on its own line', () => {
    const s = pakemSection(full)
    expect(s).toContain('- Sebut nama anak minimal sekali')
    expect(s).toContain('- Jangan pakai angka statistik')
  })

  it('forbids reusing the voice sample wording', () => {
    // Without this the model lifts the sample line verbatim into a script about
    // a completely different topic.
    const s = pakemSection(full)
    expect(s).toContain('never reuse their wording')
    expect(s).toContain('Bunda, coba cek deh label susunya.')
  })

  it('omits fields the writer cleared instead of printing empty labels', () => {
    const s = pakemSection({ ...full, cta_style: '', pacing: '   ', voice_sample: '' })
    expect(s).not.toContain('CTA must work')
    expect(s).not.toContain('Pacing')
    expect(s).not.toContain('Voice reference')
  })

  it('sanitizes control and bidi characters', () => {
    const s = pakemSection({ ...full, hook_style: 'buka​‮ pertanyaan' })
    expect(s).not.toContain('​')
    expect(s).not.toContain('‮')
  })

  it('does not leak the detected format into the prompt as a constraint', () => {
    // detected_format exists only to warn about a clash; the ticked content
    // format is the authority on shape.
    expect(pakemSection(full)).not.toContain('talking_head')
  })
})

// ── Integration with the generation prompt ──────────────────────────────────
import { buildGenerationPrompt, type PersonaForPrompt, type BriefForPrompt, type HookRubricForPrompt } from '@/lib/cakgpt/prompts'
import { resolveContentFormat } from '@/lib/cakgpt/content-formats'

const persona: PersonaForPrompt = {
  name: 'Orla Sondang', tone: 'hangat', diction_quirks: '-',
  banned_words: [], required_words: [], sample_lines: [], red_flags: [],
}
const brief: BriefForPrompt = { title: 'Nutrisi Anak', product: 'Susu', platform: 'tiktok', fields: {} }
const rubrics: HookRubricForPrompt[] = [
  { slug: 'pattern_interrupt', name: 'Pattern Interrupt', description: 'jolt', example: 'Lihat ini' },
]

function prompt(over: { pakem?: PakemStructure | null; pakemName?: string; format?: string; steering?: string } = {}) {
  return buildGenerationPrompt({
    persona, brief, hookRubrics: rubrics,
    platform: 'tiktok', targetDurationS: 30, aspectRatio: '9:16',
    pakem: over.pakem ?? null,
    pakemName: over.pakemName,
    contentFormat: resolveContentFormat(over.format),
    extraContext: over.steering,
  })
}

describe('pakem inside buildGenerationPrompt', () => {
  it('adds nothing when no pakem is picked', () => {
    expect(prompt()).not.toContain('SCRIPT PAKEM')
  })

  it('is read BEFORE the brief, so the brief cannot reshape the structure', () => {
    const p = prompt({ pakem: full })
    expect(p.indexOf('SCRIPT PAKEM')).toBeLessThan(p.indexOf('## STRATEGIST BRIEF'))
  })

  it('sits BELOW the content format — format decides the kind of video', () => {
    const p = prompt({ pakem: full, format: 'vlog' })
    expect(p.indexOf('CONTENT FORMAT IS LOCKED')).toBeLessThan(p.indexOf('SCRIPT PAKEM'))
  })

  it('still sits below the writer steering, which outranks everything', () => {
    const p = prompt({ pakem: full, steering: 'durasi 10 detik' })
    expect(p.indexOf('WRITER STEERING')).toBeLessThan(p.indexOf('SCRIPT PAKEM'))
  })

  it('carries the pakem name so the output is traceable to a stored structure', () => {
    expect(prompt({ pakem: full, pakemName: 'Pakem Edukasi' })).toContain('SCRIPT PAKEM — Pakem Edukasi')
  })

  it('injects the writer-edited shot range verbatim', () => {
    expect(prompt({ pakem: { ...full, shot_min: 3, shot_max: 3 } })).toContain('3 shot')
  })
})
