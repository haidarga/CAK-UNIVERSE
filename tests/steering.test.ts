import { describe, it, expect } from 'vitest'
import { parseSteeringDurationS, steeringMentions } from '@/lib/cakgpt/steering'

// The writer's "Arahan" box is the one place they can override what the brief
// says. Duration is the field that MUST be deterministic: the prompt states
// "Target duration: Ns" as a hard number, so if steering says 10 detik and the
// brief says 30, the number in the prompt has to actually change — telling the
// model "obey the steering" in prose loses to an explicit contradicting number.
describe('parseSteeringDurationS', () => {
  it('returns null when there is no steering at all', () => {
    expect(parseSteeringDurationS(undefined)).toBeNull()
    expect(parseSteeringDurationS('')).toBeNull()
    expect(parseSteeringDurationS('   ')).toBeNull()
  })

  it('returns null when the steering has no duration in it', () => {
    expect(parseSteeringDurationS('lokasi di laboratorium, pakai jas lab')).toBeNull()
    expect(parseSteeringDurationS('bikin lebih santai dan hangat')).toBeNull()
  })

  it('reads the real-world arahan the writer typed', () => {
    // Verbatim from the reported bug: asked for 10s, got a 30s script.
    expect(
      parseSteeringDurationS('durasi 10 detik ajah, lokasi di laboratorium dan juga pakaian menggunakan pakaian laboratorium'),
    ).toBe(10)
  })

  it('reads seconds in several spellings', () => {
    expect(parseSteeringDurationS('10 detik')).toBe(10)
    expect(parseSteeringDurationS('maksimal 15 dtk')).toBe(15)
    expect(parseSteeringDurationS('20 seconds')).toBe(20)
    expect(parseSteeringDurationS('durasi 8s')).toBe(8)
    expect(parseSteeringDurationS('DURASI 12 DETIK')).toBe(12)
  })

  it('converts minutes to seconds', () => {
    expect(parseSteeringDurationS('1 menit')).toBe(60)
    expect(parseSteeringDurationS('durasi 2 menit aja')).toBe(120)
    expect(parseSteeringDurationS('1,5 menit')).toBe(90)
    expect(parseSteeringDurationS('3 minutes')).toBe(180)
  })

  it('does not mistake a timestamp for a duration', () => {
    // Writers paste timecodes into steering; "00:05" is not "5 seconds".
    expect(parseSteeringDurationS('ikutin timeline 00:00 - 00:05 lalu 00:05 - 00:12')).toBeNull()
  })

  it('does not mistake a shot count for a duration', () => {
    expect(parseSteeringDurationS('bikin 10 shot aja')).toBeNull()
    expect(parseSteeringDurationS('4 scene di dapur')).toBeNull()
  })

  it('clamps absurd values into the schema-valid range', () => {
    // FormatMetaSchema accepts 1..1800; generation clamps to 3..600.
    expect(parseSteeringDurationS('0 detik')).toBeNull()
    expect(parseSteeringDurationS('1 detik')).toBe(3)
    expect(parseSteeringDurationS('99 menit')).toBe(600)
  })

  it('takes the first duration when several are mentioned', () => {
    expect(parseSteeringDurationS('durasi 10 detik, jangan sampai 30 detik')).toBe(10)
  })
})

// Location/wardrobe are free Indonesian prose — regex-extracting them would be
// brittle and would silently mangle the writer's words. Instead we only DETECT
// that they were steered, so the prompt can name them as locked and forbid the
// model from inventing its own.
describe('steeringMentions', () => {
  it('detects nothing on empty steering', () => {
    expect(steeringMentions(undefined)).toEqual({ duration: false, location: false, wardrobe: false })
  })

  it('detects all three from the real-world arahan', () => {
    expect(
      steeringMentions('durasi 10 detik ajah, lokasi di laboratorium dan juga pakaian menggunakan pakaian laboratorium'),
    ).toEqual({ duration: true, location: true, wardrobe: true })
  })

  it('detects location from several words', () => {
    expect(steeringMentions('lokasi di dapur').location).toBe(true)
    expect(steeringMentions('setting di kantor').location).toBe(true)
    expect(steeringMentions('ambil di laboratorium').location).toBe(true)
    expect(steeringMentions('shot di outdoor taman').location).toBe(true)
  })

  it('detects wardrobe from several words', () => {
    expect(steeringMentions('pakai jas lab').wardrobe).toBe(true)
    expect(steeringMentions('pakaian formal').wardrobe).toBe(true)
    expect(steeringMentions('wardrobe: kaos putih').wardrobe).toBe(true)
    expect(steeringMentions('outfit casual').wardrobe).toBe(true)
    expect(steeringMentions('bajunya seragam').wardrobe).toBe(true)
  })

  it('does not fire on unrelated steering', () => {
    expect(steeringMentions('bikin lebih lucu dan cepat')).toEqual({
      duration: false, location: false, wardrobe: false,
    })
  })
})
