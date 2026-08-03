// Structural edits to a naskah body — adding, removing and renumbering shots.
//
// Kept out of the component so the numbering rules are testable on their own:
// shot_no/line_no are not decoration, they are what the Studio storyboards
// against and what QC flags snapshot, so a gap or a duplicate after a delete
// shows up as a mislabeled shot much further downstream.
import { generateBlockId } from '@/lib/cakgpt/block-id'
import type { Block } from '@/lib/cakgpt/schemas'

// Matches the cap on the manual-edit endpoint (ManualEditBody). Enforced in the
// UI too so "Add shot" simply stops instead of letting the writer build a body
// the save call will reject after the fact.
export const MAX_EDITED_BLOCKS = 100

/**
 * Rewrites shot_no/line_no so both run contiguously from 1.
 *
 * Blocks that sat in the SAME shot and are still adjacent stay in one shot — a
 * shot may legitimately hold several spoken lines, and splitting those apart
 * would silently change the shot list the video studio renders. line_no runs
 * 1..N across the whole naskah, matching how generation emits it.
 */
export function renumberBlocks(blocks: Block[]): Block[] {
  return renumberWithBreaks(blocks, EMPTY_BREAKS)
}

const EMPTY_BREAKS: ReadonlySet<number> = new Set()

// `breakAt` names indices that must start a NEW shot regardless of what their
// shot_no currently says. Needed on insert: a freshly added block carries a
// provisional number that can collide with the block it was spliced in front
// of, and value-comparison alone would silently fuse the two into one shot.
function renumberWithBreaks(blocks: Block[], breakAt: ReadonlySet<number>): Block[] {
  let shotNo = 0
  let prevOriginalShot: number | null = null

  return blocks.map((b, i) => {
    const sameShotAsPrev = i > 0 && b.shot_no === prevOriginalShot && !breakAt.has(i)
    if (!sameShotAsPrev) shotNo += 1
    prevOriginalShot = b.shot_no
    return { ...b, shot_no: shotNo, line_no: i + 1 }
  })
}

/**
 * Removes one block and closes the numbering gap. Refuses to empty the naskah:
 * the version schema requires at least one block, so allowing it would let the
 * writer clear the screen and only discover the rejection on save.
 */
export function deleteBlockAt(blocks: Block[], blockId: string): Block[] {
  if (blocks.length <= 1) return blocks
  const next = blocks.filter((b) => b.block_id !== blockId)
  if (next.length === blocks.length) return blocks // unknown id — nothing to do
  return renumberBlocks(next)
}

/**
 * Inserts an empty shot after `afterBlockId` (or at the end when null).
 *
 * The new shot inherits section/speaker/location/wardrobe from the shot above:
 * a shot added mid-scene is nearly always the same set and the same outfit, and
 * retyping those is the tedious part. Timecode is deliberately NOT inherited —
 * two shots sharing one time range would be wrong on the storyboard.
 */
export function insertBlockAfter(blocks: Block[], afterBlockId: string | null): Block[] {
  if (blocks.length >= MAX_EDITED_BLOCKS) return blocks

  const anchorIdx = afterBlockId ? blocks.findIndex((b) => b.block_id === afterBlockId) : -1
  const insertAt = anchorIdx >= 0 ? anchorIdx + 1 : blocks.length
  const source = blocks[anchorIdx >= 0 ? anchorIdx : blocks.length - 1]

  const fresh: Block = {
    block_id: generateBlockId(),
    section_key: source?.section_key || 'body',
    shot_no: (source?.shot_no ?? 0) + 1,
    line_no: insertAt + 1,
    speaker: source?.speaker ?? null,
    timestamp_range: null,
    location: source?.location ?? null,
    wardrobe: source?.wardrobe ?? null,
    text: '',
    visual_note: null,
  }

  const next = [...blocks.slice(0, insertAt), fresh, ...blocks.slice(insertAt)]
  // The new block starts its own shot, and so does whatever it was pushed in
  // front of — otherwise the two would share a shot number.
  return renumberWithBreaks(next, new Set([insertAt, insertAt + 1]))
}
