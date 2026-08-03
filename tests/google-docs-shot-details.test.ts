import { describe, it, expect } from 'vitest'
import { renderNaskahForDoc, reconstructBlocksFromLines } from '@/lib/cakgpt/google-docs'
import type { Block } from '@/lib/cakgpt/schemas'

function block(over: Partial<Block> = {}): Block {
  return {
    block_id: 'b1',
    section_key: 'hook',
    shot_no: 1,
    line_no: 1,
    speaker: 'Fajar Sondang',
    timestamp_range: '00:00 - 00:05',
    location: 'Laboratorium Nutrisi - Cool White Lighting',
    wardrobe: 'Jas Lab Putih & Name Tag',
    text: 'Lihat anak ini... Miris ya?',
    visual_note: 'Talking head, close-up',
    ...over,
  }
}

describe('renderNaskahForDoc — shot details reach the Doc', () => {
  it('writes timestamp, location, wardrobe and visual note', () => {
    const { text } = renderNaskahForDoc({ naskah_id: 'n1', title: 'Judul', body: [block()] })
    expect(text).toContain('[00:00 - 00:05] Fajar Sondang: Lihat anak ini... Miris ya?')
    expect(text).toContain('📍 Laboratorium Nutrisi - Cool White Lighting')
    expect(text).toContain('👔 Jas Lab Putih & Name Tag')
    expect(text).toContain('🎬 Talking head, close-up')
  })

  it('omits any detail the block does not carry, with no empty leftovers', () => {
    const { text } = renderNaskahForDoc({
      naskah_id: 'n1', title: 'Judul',
      body: [block({ timestamp_range: null, location: null, wardrobe: null, visual_note: null })],
    })
    expect(text).toContain('Fajar Sondang: Lihat anak ini... Miris ya?')
    expect(text).not.toContain('[')
    expect(text).not.toContain('📍')
    expect(text).not.toContain('👔')
    expect(text).not.toContain('🎬')
  })

  it('treats a blank-string detail the same as a missing one', () => {
    const { text } = renderNaskahForDoc({
      naskah_id: 'n1', title: 'Judul',
      body: [block({ location: '   ', wardrobe: '' })],
    })
    expect(text).not.toContain('📍')
    expect(text).not.toContain('👔')
  })

  it('keeps every styling range inside the rendered text', () => {
    // Ranges become Google Docs index spans; one past the end fails the whole
    // atomic batchUpdate for every naskah in the push, not just this one.
    const r = renderNaskahForDoc({ naskah_id: 'n1', title: 'Judul', body: [block(), block({ block_id: 'b2', section_key: 'body' })] })
    for (const range of [...r.speakerRanges, ...r.noteRanges]) {
      expect(range.start).toBeGreaterThanOrEqual(0)
      expect(range.end).toBeLessThanOrEqual(r.text.length)
      expect(range.end).toBeGreaterThan(range.start)
    }
  })
})

describe('reconstructBlocksFromLines — Doc round-trip', () => {
  it('recovers timestamp, location, wardrobe and visual note from a pushed doc', () => {
    const { text } = renderNaskahForDoc({ naskah_id: 'n1', title: 'Judul', body: [block()] })
    // pull feeds the section's lines minus the heading.
    const lines = text.split('\n').slice(1).filter((l) => l.trim().length > 0)
    const blocks = reconstructBlocksFromLines(lines)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].timestamp_range).toBe('00:00 - 00:05')
    expect(blocks[0].location).toBe('Laboratorium Nutrisi - Cool White Lighting')
    expect(blocks[0].wardrobe).toBe('Jas Lab Putih & Name Tag')
    expect(blocks[0].visual_note).toBe('Talking head, close-up')
    expect(blocks[0].text).toContain('Lihat anak ini')
  })

  it('does not turn a detail line into its own dialogue block', () => {
    // The regression this guards: an unrecognised "📍 ..." line would become a
    // new block whose spoken text is the location, so the naskah grows a fake
    // line of dialogue on every push→pull cycle.
    const blocks = reconstructBlocksFromLines([
      '[00:00 - 00:05] Fajar Sondang: Lihat anak ini...',
      '   📍 Laboratorium',
      '   👔 Jas Lab Putih',
      '   🎬 Close-up',
    ])
    expect(blocks).toHaveLength(1)
  })

  it('round-trips a multi-block naskah without drift', () => {
    const body = [
      block(),
      block({ block_id: 'b2', section_key: 'body', shot_no: 2, line_no: 2, timestamp_range: '00:05 - 00:08', text: 'Anak rentan sama makanan.' }),
    ]
    const { text } = renderNaskahForDoc({ naskah_id: 'n1', title: 'Judul', body })
    const lines = text.split('\n').slice(1).filter((l) => l.trim().length > 0)
    const out = reconstructBlocksFromLines(lines)

    expect(out).toHaveLength(2)
    expect(out[0].timestamp_range).toBe('00:00 - 00:05')
    expect(out[1].timestamp_range).toBe('00:05 - 00:08')
    expect(out[1].text).toContain('Anak rentan')
  })

  it('still parses docs pushed before shot details existed', () => {
    // Legacy shape: bare "Speaker: line" plus a fully-bracketed visual note.
    const blocks = reconstructBlocksFromLines([
      'Fajar Sondang: Lihat anak ini...',
      '   [Talking head overlaid on b-roll]',
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].visual_note).toBe('Talking head overlaid on b-roll')
  })

  it('leaves a freely written line alone', () => {
    const blocks = reconstructBlocksFromLines(['Ini kalimat yang ditulis ulang penulis.'])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('Ini kalimat yang ditulis ulang penulis.')
    expect(blocks[0].timestamp_range ?? null).toBeNull()
  })

  it('ignores a stray detail line with no block before it', () => {
    const blocks = reconstructBlocksFromLines(['   📍 Laboratorium'])
    expect(blocks).toHaveLength(0)
  })
})
