import { describe, it, expect } from 'vitest'
import {
  CONTENT_FORMAT_PRESETS,
  resolveContentFormat,
  contentFormatSection,
  isCustomFormat,
  MAX_CUSTOM_FORMAT_LEN,
} from '@/lib/cakgpt/content-formats'

describe('CONTENT_FORMAT_PRESETS', () => {
  it('covers the formats the team actually shoots', () => {
    const keys = CONTENT_FORMAT_PRESETS.map((f) => f.key)
    expect(keys).toContain('talking_head')
    expect(keys).toContain('vlog')
    expect(keys).toContain('skit')
    expect(keys).toContain('voiceover_broll')
  })

  it('gives every preset real structural rules, not just a label', () => {
    // A format that only contributes its name changes nothing about the script —
    // that is exactly the bug this feature exists to fix.
    for (const f of CONTENT_FORMAT_PRESETS) {
      expect(f.label.length).toBeGreaterThan(0)
      expect(f.rules.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('has unique keys', () => {
    const keys = CONTENT_FORMAT_PRESETS.map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('resolveContentFormat', () => {
  it('resolves a preset by key', () => {
    const f = resolveContentFormat('talking_head')
    expect(f?.label).toMatch(/talking head/i)
    expect(isCustomFormat(f!)).toBe(false)
  })

  it('returns null for empty input', () => {
    expect(resolveContentFormat('')).toBeNull()
    expect(resolveContentFormat(null)).toBeNull()
    expect(resolveContentFormat(undefined)).toBeNull()
    expect(resolveContentFormat('   ')).toBeNull()
  })

  it('treats an unknown value as a CUSTOM format instead of dropping it', () => {
    // The writer must be able to invent a format we never listed; silently
    // ignoring it is how "arahan" failed in the first place.
    const f = resolveContentFormat('ASMR unboxing sambil bisik-bisik')
    expect(f).not.toBeNull()
    expect(isCustomFormat(f!)).toBe(true)
    expect(f!.label).toBe('ASMR unboxing sambil bisik-bisik')
  })

  it('gives a custom format the same hard-lock rules as a preset', () => {
    const f = resolveContentFormat('wawancara jalanan')!
    expect(f.rules.length).toBeGreaterThanOrEqual(2)
  })

  it('caps an absurdly long custom format', () => {
    const f = resolveContentFormat('x'.repeat(MAX_CUSTOM_FORMAT_LEN + 500))!
    expect(f.label.length).toBeLessThanOrEqual(MAX_CUSTOM_FORMAT_LEN)
  })

  it('strips control and bidi characters from a custom format', () => {
    const f = resolveContentFormat('vlog​‮ santai')!
    expect(f.label).not.toContain('​')
    expect(f.label).not.toContain('‮')
  })

  it('matches a preset case-insensitively by label too', () => {
    // The UI sends keys, but a stored value or a pasted label should still land.
    expect(resolveContentFormat('Talking Head')?.key).toBe('talking_head')
    expect(resolveContentFormat('VLOG')?.key).toBe('vlog')
  })
})

describe('contentFormatSection', () => {
  it('is empty when no format was chosen', () => {
    expect(contentFormatSection(null)).toBe('')
  })

  it('states the format is locked and outranks the brief', () => {
    const s = contentFormatSection(resolveContentFormat('talking_head'))
    expect(s).toContain('CONTENT FORMAT IS LOCKED')
    expect(s).toContain('OVERRIDES')
  })

  it('injects the structural rules, not just the name', () => {
    const s = contentFormatSection(resolveContentFormat('vlog'))
    // Vlog must actually change the shot structure: movement + activity.
    expect(s.toLowerCase()).toContain('handheld')
    expect(s.toLowerCase()).toContain('establishing')
  })

  it('talking head forbids the multi-location wandering that broke the last batch', () => {
    const s = contentFormatSection(resolveContentFormat('talking_head'))
    expect(s.toLowerCase()).toContain('one location')
  })

  it('voice-over b-roll keeps the persona out of frame', () => {
    const s = contentFormatSection(resolveContentFormat('voiceover_broll'))
    expect(s.toLowerCase()).toContain('never appears on camera')
  })

  it('skit demands more than one speaker', () => {
    const s = contentFormatSection(resolveContentFormat('skit'))
    expect(s.toLowerCase()).toContain('speaker')
  })

  it('passes a custom format through verbatim under the same lock', () => {
    const s = contentFormatSection(resolveContentFormat('ASMR unboxing bisik-bisik'))
    expect(s).toContain('CONTENT FORMAT IS LOCKED')
    expect(s).toContain('ASMR unboxing bisik-bisik')
  })
})

// ── Integration with the generation prompt ──────────────────────────────────
import { buildGenerationPrompt, type PersonaForPrompt, type BriefForPrompt, type HookRubricForPrompt } from '@/lib/cakgpt/prompts'

const persona: PersonaForPrompt = {
  name: 'Orla Sondang', tone: 'hangat', diction_quirks: '-',
  banned_words: [], required_words: [], sample_lines: [], red_flags: [],
}
const brief: BriefForPrompt = { title: 'Nutrisi Anak', product: 'Susu', platform: 'tiktok', fields: {} }
const rubrics: HookRubricForPrompt[] = [
  { slug: 'pattern_interrupt', name: 'Pattern Interrupt', description: 'jolt', example: 'Lihat ini' },
]

function prompt(formatValue?: string, steering?: string) {
  return buildGenerationPrompt({
    persona, brief, hookRubrics: rubrics,
    platform: 'tiktok', targetDurationS: 30, aspectRatio: '9:16',
    contentFormat: resolveContentFormat(formatValue),
    extraContext: steering,
  })
}

describe('content format inside buildGenerationPrompt', () => {
  it('adds nothing when no format is chosen', () => {
    expect(prompt(undefined)).not.toContain('CONTENT FORMAT IS LOCKED')
  })

  it('is read BEFORE the brief, so the brief cannot pull the shape back', () => {
    const p = prompt('vlog')
    expect(p.indexOf('CONTENT FORMAT IS LOCKED')).toBeLessThan(p.indexOf('## STRATEGIST BRIEF'))
  })

  it('sits below the writer steering — the writer still outranks it', () => {
    const p = prompt('vlog', 'durasi 10 detik')
    expect(p.indexOf('WRITER STEERING')).toBeLessThan(p.indexOf('CONTENT FORMAT IS LOCKED'))
  })

  it('tells the shot-detail fields to obey the format', () => {
    // Without this the per-shot location/wardrobe instructions read as licence
    // to keep changing sets, which contradicts a locked Talking Head.
    expect(prompt('talking_head')).toContain('must OBEY the locked content format')
  })

  it('does not add that clause when no format is locked', () => {
    expect(prompt(undefined)).not.toContain('must OBEY the locked content format')
  })

  it('carries a custom format into the prompt verbatim', () => {
    expect(prompt('ASMR unboxing bisik-bisik')).toContain('ASMR unboxing bisik-bisik')
  })
})
