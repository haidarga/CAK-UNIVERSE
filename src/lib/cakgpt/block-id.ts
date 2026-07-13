import { nanoid } from 'nanoid'

// block_id is the stable, permanent address a QC flag points at (ARCHITECTURE.md §3).
// Always generated here, server-side — never trust the model to invent one.
export function generateBlockId(): string {
  return `blk_${nanoid(10)}`
}
