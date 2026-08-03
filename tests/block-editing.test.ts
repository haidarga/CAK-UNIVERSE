import { describe, it, expect } from 'vitest'
import { renumberBlocks, deleteBlockAt, insertBlockAfter, MAX_EDITED_BLOCKS } from '@/lib/cakgpt/blocks'
import type { Block } from '@/lib/cakgpt/schemas'

function mk(over: Partial<Block> & { block_id: string }): Block {
  return {
    section_key: 'body', shot_no: 1, line_no: 1, speaker: 'Fajar',
    timestamp_range: null, location: null, wardrobe: null,
    text: 'halo', visual_note: null,
    ...over,
  }
}

describe('renumberBlocks', () => {
  it('closes the gap left by a deleted shot', () => {
    const out = renumberBlocks([
      mk({ block_id: 'a', shot_no: 1, line_no: 1 }),
      mk({ block_id: 'c', shot_no: 3, line_no: 3 }),
      mk({ block_id: 'd', shot_no: 4, line_no: 4 }),
    ])
    expect(out.map((b) => b.shot_no)).toEqual([1, 2, 3])
    expect(out.map((b) => b.line_no)).toEqual([1, 2, 3])
  })

  it('keeps several lines that shared one shot together in that shot', () => {
    // A shot can hold multiple spoken lines; renumbering must not explode it
    // into separate shots (that would change the shot list the Studio renders).
    const out = renumberBlocks([
      mk({ block_id: 'a', shot_no: 2, line_no: 1 }),
      mk({ block_id: 'b', shot_no: 2, line_no: 2 }),
      mk({ block_id: 'c', shot_no: 5, line_no: 3 }),
    ])
    expect(out.map((b) => b.shot_no)).toEqual([1, 1, 2])
    expect(out.map((b) => b.line_no)).toEqual([1, 2, 3])
  })

  it('does not merge two different shots that happen to be adjacent', () => {
    const out = renumberBlocks([
      mk({ block_id: 'a', shot_no: 1 }),
      mk({ block_id: 'b', shot_no: 2 }),
    ])
    expect(out.map((b) => b.shot_no)).toEqual([1, 2])
  })

  it('preserves block_id, text and every shot detail', () => {
    const out = renumberBlocks([
      mk({ block_id: 'keep', shot_no: 9, line_no: 9, text: 'jangan hilang', location: 'Lab', wardrobe: 'Jas', timestamp_range: '00:00 - 00:05', visual_note: 'close-up', section_key: 'hook' }),
    ])
    expect(out[0]).toMatchObject({
      block_id: 'keep', text: 'jangan hilang', location: 'Lab',
      wardrobe: 'Jas', timestamp_range: '00:00 - 00:05',
      visual_note: 'close-up', section_key: 'hook',
      shot_no: 1, line_no: 1,
    })
  })

  it('handles an empty list', () => {
    expect(renumberBlocks([])).toEqual([])
  })
})

describe('deleteBlockAt', () => {
  const base = [
    mk({ block_id: 'a', shot_no: 1, line_no: 1 }),
    mk({ block_id: 'b', shot_no: 2, line_no: 2 }),
    mk({ block_id: 'c', shot_no: 3, line_no: 3 }),
  ]

  it('removes the shot and renumbers what is left', () => {
    const out = deleteBlockAt(base, 'b')
    expect(out.map((b) => b.block_id)).toEqual(['a', 'c'])
    expect(out.map((b) => b.shot_no)).toEqual([1, 2])
  })

  it('refuses to delete the last remaining shot', () => {
    // The version schema requires at least one block; an empty body would be
    // rejected server-side AFTER the writer already lost the text on screen.
    const one = [mk({ block_id: 'only' })]
    expect(deleteBlockAt(one, 'only')).toEqual(one)
  })

  it('is a no-op for an unknown block_id', () => {
    expect(deleteBlockAt(base, 'nope').map((b) => b.block_id)).toEqual(['a', 'b', 'c'])
  })

  it('does not mutate the input array', () => {
    const input = [...base]
    deleteBlockAt(input, 'b')
    expect(input).toHaveLength(3)
  })
})

describe('insertBlockAfter', () => {
  const base = [
    mk({ block_id: 'a', shot_no: 1, line_no: 1, section_key: 'hook', location: 'Lab', wardrobe: 'Jas Lab', speaker: 'Fajar' }),
    mk({ block_id: 'b', shot_no: 2, line_no: 2, section_key: 'cta' }),
  ]

  it('inserts directly after the given block and renumbers', () => {
    const out = insertBlockAfter(base, 'a')
    expect(out).toHaveLength(3)
    expect(out[1].block_id).not.toBe('a')
    expect(out[1].block_id).not.toBe('b')
    expect(out.map((b) => b.shot_no)).toEqual([1, 2, 3])
  })

  it('inherits section, speaker, location and wardrobe from the shot above', () => {
    // Continuity: a shot added mid-scene is almost always the same set and
    // outfit, and re-typing them for every insert is the tedious part.
    const added = insertBlockAfter(base, 'a')[1]
    expect(added.section_key).toBe('hook')
    expect(added.speaker).toBe('Fajar')
    expect(added.location).toBe('Lab')
    expect(added.wardrobe).toBe('Jas Lab')
  })

  it('starts the new shot empty, with no inherited timecode', () => {
    const added = insertBlockAfter(base, 'a')[1]
    expect(added.text).toBe('')
    expect(added.timestamp_range).toBeNull()
    expect(added.visual_note).toBeNull()
  })

  it('gives the new block a fresh unique block_id', () => {
    const out = insertBlockAfter(base, 'a')
    expect(new Set(out.map((b) => b.block_id)).size).toBe(3)
  })

  it('appends at the end when no anchor is given', () => {
    const out = insertBlockAfter(base, null)
    expect(out).toHaveLength(3)
    expect(out[2].text).toBe('')
  })

  it('appends to an empty naskah', () => {
    const out = insertBlockAfter([], null)
    expect(out).toHaveLength(1)
    expect(out[0].shot_no).toBe(1)
    expect(out[0].section_key).toBe('body')
  })

  it('refuses to grow past the version cap', () => {
    const full = Array.from({ length: MAX_EDITED_BLOCKS }, (_, i) =>
      mk({ block_id: `b${i}`, shot_no: i + 1, line_no: i + 1 }))
    expect(insertBlockAfter(full, null)).toHaveLength(MAX_EDITED_BLOCKS)
  })

  it('does not mutate the input array', () => {
    const input = [...base]
    insertBlockAfter(input, 'a')
    expect(input).toHaveLength(2)
  })
})
