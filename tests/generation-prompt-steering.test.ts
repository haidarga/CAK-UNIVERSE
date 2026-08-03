import { describe, it, expect } from 'vitest'
import { buildGenerationPrompt, type PersonaForPrompt, type BriefForPrompt, type HookRubricForPrompt } from '@/lib/cakgpt/prompts'

const persona: PersonaForPrompt = {
  name: 'Fajar Sondang',
  tone: 'hangat, ngobrol santai',
  diction_quirks: 'pakai "bro" sesekali',
  banned_words: [],
  required_words: [],
  sample_lines: ['Lihat anak ini...'],
  red_flags: [],
}

const brief: BriefForPrompt = {
  title: 'Pattern Interrupt: Child Health Concerns and Nutrition',
  product: 'Susu Formula',
  platform: 'tiktok',
  // The brief says 30s — the bug was that this beat a steering asking for 10.
  fields: { durasi: '30 detik', topic: 'nutrisi anak' },
}

const rubrics: HookRubricForPrompt[] = [
  { slug: 'pattern_interrupt', name: 'Pattern Interrupt', description: 'jolt the scroll', example: 'Lihat ini...' },
]

function build(extraContext?: string, targetDurationS = 30) {
  return buildGenerationPrompt({
    persona, brief, hookRubrics: rubrics,
    platform: 'tiktok', targetDurationS, aspectRatio: '9:16',
    extraContext,
  })
}

describe('buildGenerationPrompt — writer steering precedence', () => {
  it('omits the steering section entirely when there is no steering', () => {
    const p = build(undefined)
    expect(p).not.toContain('WRITER STEERING')
    expect(p).not.toContain('IS LOCKED')
  })

  it('places steering ABOVE the brief so it is read first', () => {
    const p = build('durasi 10 detik ajah, lokasi di laboratorium', 10)
    const steeringAt = p.indexOf('WRITER STEERING')
    const briefAt = p.indexOf('## STRATEGIST BRIEF')
    expect(steeringAt).toBeGreaterThan(-1)
    expect(briefAt).toBeGreaterThan(-1)
    expect(steeringAt).toBeLessThan(briefAt)
  })

  it('states that steering outranks the brief', () => {
    const p = build('durasi 10 detik')
    expect(p).toContain('OVERRIDES THE BRIEF')
    expect(p).toContain('THE STEERING WINS')
  })

  it('locks duration and quotes the ceiling as a timecode', () => {
    const p = build('durasi 10 detik ajah', 10)
    expect(p).toContain('DURATION IS LOCKED at 10s')
    expect(p).toContain('00:10')
    // The format line must agree with the locked value, not the brief's 30s.
    expect(p).toContain('Target duration: 10s')
  })

  it('locks location and wardrobe when the writer pinned them', () => {
    const p = build('lokasi di laboratorium dan pakaian menggunakan pakaian laboratorium', 10)
    expect(p).toContain('LOCATION IS LOCKED')
    expect(p).toContain('WARDROBE IS LOCKED')
    expect(p).toContain('Do NOT relocate mid-script')
  })

  it('only locks the fields actually steered', () => {
    const p = build('bikin lebih lucu aja')
    expect(p).not.toContain('DURATION IS LOCKED')
    expect(p).not.toContain('LOCATION IS LOCKED')
    expect(p).not.toContain('WARDROBE IS LOCKED')
    // ...but the steering itself is still passed through.
    expect(p).toContain('bikin lebih lucu aja')
  })

  it('tells the model the duration is a total, not per shot', () => {
    const p = build('durasi 10 detik', 10)
    expect(p).toContain('total for ALL shots combined')
  })

  it('still asks for location/wardrobe/timestamp on every block', () => {
    const p = build(undefined)
    expect(p).toContain('timestamp_range')
    expect(p).toContain('location')
    expect(p).toContain('wardrobe')
    expect(p).toContain('Fill all three on EVERY block')
  })

  it('renders a minutes-scale ceiling correctly', () => {
    const p = build('durasi 2 menit', 120)
    expect(p).toContain('02:00')
  })

  it('keeps sanitizing steering (control chars stripped, not executed)', () => {
    const p = build('durasi 10 detik​‮')
    expect(p).not.toContain('​')
    expect(p).not.toContain('‮')
  })
})
