// Google Docs API wrapper + the naskah <-> Doc text rendering/parsing used by
// Phase 2 Milestone 4 (ARCHITECTURE.md §9). This is a deliberately simple
// FULL-REWRITE sync, not a rich structural round-trip:
//   - Push: re-renders every naskah in a batch as plain text into the Doc,
//     clearing whatever was there before. Each naskah's heading paragraph is
//     tagged with a Google Docs NAMED RANGE (name = naskah_id) so pull can
//     re-identify it — this is metadata attached to a text range, invisible
//     to the reader, unlike the old `[[id:...]]` marker that used to sit
//     right in the visible title.
//   - Pull: re-parses the Doc's plain text back into blocks on a best-effort
//     basis. Push no longer writes the old "shot.line (section): " prefix —
//     it was machine scaffolding the writer had to read on every line — so
//     pull now rebuilds blocks positionally with fresh block_ids. That is the
//     same path a human-rewritten line always took (see qc_flags target_ref /
//     ARCHITECTURE.md §3); the STRUCTURED_LINE_RE branch is kept only for docs
//     pushed before this change.
import type { Block, BlockInput } from '@/lib/cakgpt/schemas'
import { generateBlockId } from '@/lib/cakgpt/block-id'

const DOCS_API = 'https://docs.googleapis.com/v1/documents'

async function docsFetch(accessToken: string, path: string, init?: RequestInit) {
  const res = await fetch(`${DOCS_API}${path}`, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `Google Docs API ${res.status}`)
  return data
}

export async function createDoc(accessToken: string, title: string): Promise<{ documentId: string }> {
  return docsFetch(accessToken, '', { method: 'POST', body: JSON.stringify({ title }) })
}

export async function getDoc(accessToken: string, documentId: string) {
  return docsFetch(accessToken, `/${documentId}`)
}

async function batchUpdateDoc(accessToken: string, documentId: string, requests: unknown[]) {
  if (requests.length === 0) return
  return docsFetch(accessToken, `/${documentId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) })
}

export async function getDocWebViewUrl(documentId: string): Promise<string> {
  return `https://docs.google.com/document/d/${documentId}/edit`
}

// Extract a Google Doc id from a pasted URL or a bare id. Restricted to the safe
// id charset so it can only ever become the path suffix of the fixed
// docs.googleapis.com URL (no SSRF / path injection).
export function parseGoogleDocId(input: string): string | null {
  const mDoc = input.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  if (mDoc) return mDoc[1]
  const mSheet = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  if (mSheet) return mSheet[1]
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input.trim())) return input.trim()
  return null
}

// Flatten a Google Doc's structure to plain text, including table cells (content
// plans / naskah are often laid out as tables). Rows render pipe-separated so a
// downstream extractor still sees column structure.
export function docToPlainText(doc: { body?: { content?: unknown[] } }): string {
  const out: string[] = []
  type Para = { elements?: Array<{ textRun?: { content?: string } }> }
  const paraText = (p: Para) => (p.elements || []).map((e) => e.textRun?.content || '').join('').replace(/\n$/, '')

  for (const el of doc.body?.content || []) {
    const node = el as { paragraph?: Para; table?: { tableRows?: Array<{ tableCells?: Array<{ content?: Array<{ paragraph?: Para }> }> }> } }
    if (node.paragraph) {
      out.push(paraText(node.paragraph))
    } else if (node.table) {
      for (const row of node.table.tableRows || []) {
        const cells = (row.tableCells || []).map((cell) =>
          (cell.content || []).map((c) => (c.paragraph ? paraText(c.paragraph) : '')).join(' ').trim(),
        )
        out.push(cells.join(' | '))
      }
    }
  }
  return out.join('\n')
}

type NaskahForDoc = { naskah_id: string; title: string | null; body: Block[] }

// Shape of Document.namedRanges: a map from name -> the list of NamedRange
// objects sharing that name, each carrying the actual index span(s). Shared
// by both the write side (clearing stale ranges before a push) and the read
// side (parseDocIntoSections).
type DocNamedRanges = Record<string, { namedRanges?: Array<{ name?: string; ranges?: Array<{ startIndex?: number; endIndex?: number }> }> }>

// Offsets are relative to this naskah's own rendered text (caller shifts by
// its running total to get absolute Doc indices). The PLAIN TEXT this produces
// carries no sync marker at all now (that moved to a named range, applied by
// the caller) — pull's STRUCTURED_LINE_RE regex matches raw text content
// only, never style, so every styling range added below is purely cosmetic
// and can't affect the Doc -> naskah round-trip (reconstructBlocksFromLines).
type RenderedNaskah = {
  text: string
  headingEnd: number
  speakerRanges: Array<{ start: number; end: number }> // "Speaker: "
  noteRanges: Array<{ start: number; end: number }> // "   [visual note]"
}

// Shot details are prefixed with an icon rather than a "Location:" label: the
// Doc is what the CLIENT reads, and a glyph column scans far faster than three
// more words of scaffolding per shot. The icons double as the parse key on the
// way back in (DETAIL_LINE_RE), so the rendered form stays machine-readable
// without reintroducing the "N.N (section):" prefix writers hated.
const DETAIL_ICONS = { location: '📍', wardrobe: '👔', visual_note: '🎬' } as const

// Exported for the round-trip test — pushNaskahToDoc is a network call, so the
// pure render is what can actually be asserted against reconstructBlocksFromLines.
export function renderNaskahForDoc(n: NaskahForDoc): RenderedNaskah {
  return renderNaskah(n)
}

function renderNaskah(n: NaskahForDoc): RenderedNaskah {
  const speakerRanges: RenderedNaskah['speakerRanges'] = []
  const noteRanges: RenderedNaskah['noteRanges'] = []

  // Collapse any embedded newline out of the title FIRST — the schema allows
  // one (no newline restriction), and an embedded \n would split this into
  // multiple Doc paragraphs while the paragraph-style/named-range requests
  // below only cover up to the first \n. A leading \n is the worst case: it
  // makes r.end === r.start, a zero-length createNamedRange range, which the
  // Docs API rejects — failing the ENTIRE batch push for every naskah in the
  // list, not just this one, since batchUpdate requests apply atomically.
  const title = (n.title || 'Untitled naskah').replace(/\s*\n\s*/g, ' ').trim() || 'Untitled naskah'
  let text = `${title}\n`
  const headingEnd = text.indexOf('\n')

  // No "N.N (section): " prefix any more — it was scaffolding for the machine
  // (pull re-parsed it) that the writer had to read on EVERY line. Sections
  // now show as a blank line where the section changes, so the shape is still
  // visible without labels. Trade-off accepted deliberately: pull can no
  // longer recover shot/line/section from the text, so a pulled naskah gets
  // fresh block_ids — the same path any human-rewritten line already took, and
  // pull has never been used on any doc here (0 of 5). The alternative (a
  // named range per block to keep it machine-readable) would mean 1000+ named
  // ranges in one doc with no documented API limit, risking the push flow that
  // IS used constantly.
  let prevSection: string | null = null
  for (const block of n.body) {
    if (prevSection !== null && block.section_key !== prevSection) text += '\n'
    prevSection = block.section_key

    // Timecode leads the line so the client can see the beat structure without
    // reading the dialogue — muted, since it is production metadata, not copy.
    if (block.timestamp_range?.trim()) {
      const tsStart = text.length
      text += `[${block.timestamp_range.trim()}] `
      noteRanges.push({ start: tsStart, end: text.length - 1 }) // exclude the trailing space
    }

    if (block.speaker) {
      const speakerStart = text.length
      text += `${block.speaker}: `
      speakerRanges.push({ start: speakerStart, end: text.length })
    }

    text += `${block.text}\n`

    // Location / wardrobe / visual note, one indented muted line each. Blank
    // and whitespace-only values are skipped rather than rendered as a lone
    // icon — an empty "📍" reads as missing data the writer must go fix.
    for (const key of ['location', 'wardrobe', 'visual_note'] as const) {
      const value = block[key]
      if (typeof value !== 'string' || !value.trim()) continue
      const detailStart = text.length
      text += `   ${DETAIL_ICONS[key]} ${value.trim()}\n`
      noteRanges.push({ start: detailStart, end: text.length - 1 }) // exclude the trailing \n
    }
  }
  return { text: text + '\n', headingEnd, speakerRanges, noteRanges }
}

const MUTED = { red: 0.45, green: 0.45, blue: 0.45 }

// Clears the doc's current body and rewrites it from the given naskah list.
export async function pushNaskahToDoc(accessToken: string, documentId: string, naskahList: NaskahForDoc[]): Promise<void> {
  const current = await getDoc(accessToken, documentId)
  const endIndex: number = current?.body?.content?.[current.body.content.length - 1]?.endIndex || 1

  const requests: unknown[] = []
  if (endIndex > 2) {
    requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } })
  }
  // Named ranges from a prior push don't reliably get cleaned up just by
  // wiping the body they used to span — explicitly drop every existing one so
  // stale entries never accumulate across repeated pushes to the same doc.
  // Assumes this doc's named-range namespace is exclusively managed by this
  // sync (fine — Push already treats the whole doc BODY the same way, fully
  // clearing and rewriting it every call).
  const existingNamedRanges = (current?.namedRanges || {}) as DocNamedRanges
  for (const name of Object.keys(existingNamedRanges)) {
    requests.push({ deleteNamedRange: { name } })
  }

  let fullText = ''
  const headingRanges: Array<{ start: number; end: number; naskahId: string }> = []
  const speakerRanges: Array<{ start: number; end: number }> = []
  const noteRanges: Array<{ start: number; end: number }> = []

  for (const n of naskahList) {
    const start = fullText.length
    const r = renderNaskah(n)
    fullText += r.text
    headingRanges.push({ start, end: start + r.headingEnd, naskahId: n.naskah_id })
    for (const x of r.speakerRanges) speakerRanges.push({ start: start + x.start, end: start + x.end })
    for (const x of r.noteRanges) noteRanges.push({ start: start + x.start, end: start + x.end })
  }
  if (fullText.length === 0) fullText = '(no naskah in this batch yet)\n'

  requests.push({ insertText: { location: { index: 1 }, text: fullText } })

  for (const r of headingRanges) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: 1 + r.start, endIndex: 1 + r.end },
        paragraphStyle: { namedStyleType: 'HEADING_1', spaceAbove: { magnitude: 24, unit: 'PT' } },
        fields: 'namedStyleType,spaceAbove',
      },
    })
    // Invisible sync tag: the naskah_id lives as a named range over the
    // heading text, not as visible characters — pull reads it back via
    // doc.namedRanges instead of regexing the title.
    requests.push({
      createNamedRange: {
        name: r.naskahId,
        range: { startIndex: 1 + r.start, endIndex: 1 + r.end },
      },
    })
  }
  // Speaker name — bold, so dialogue attribution reads at a glance.
  for (const r of speakerRanges) {
    requests.push({
      updateTextStyle: {
        range: { startIndex: 1 + r.start, endIndex: 1 + r.end },
        textStyle: { bold: true },
        fields: 'bold',
      },
    })
  }
  // Stage direction — italic + muted, reads as a note rather than dialogue.
  for (const r of noteRanges) {
    requests.push({
      updateTextStyle: {
        range: { startIndex: 1 + r.start, endIndex: 1 + r.end },
        textStyle: { italic: true, foregroundColor: { color: { rgbColor: MUTED } } },
        fields: 'italic,foregroundColor',
      },
    })
  }

  await batchUpdateDoc(accessToken, documentId, requests)
}

type ParsedSection = { naskahId: string; lines: string[] }

const HEADING_ID_RE = /\[\[id:([0-9a-fA-F-]{36})\]\]/
const STRUCTURED_LINE_RE = /^(\d+)\.(\d+)\s*\(([^)]+)\):\s*(?:([^:]+):\s*)?(.*)$/
const VISUAL_NOTE_RE = /^\s*\[(.+)\]\s*$/
// The shot-detail lines push now writes. Without these, pull would not
// recognise them and each one would come back as a NEW block whose spoken text
// is the location/wardrobe — the naskah would grow three fake lines of
// dialogue per shot on every push→pull cycle.
const DETAIL_LINE_RE = /^\s*(📍|👔|🎬)\s*(.+?)\s*$/
const DETAIL_KEY_BY_ICON: Record<string, 'location' | 'wardrobe' | 'visual_note'> = {
  '📍': 'location', '👔': 'wardrobe', '🎬': 'visual_note',
}
// Leading "[00:00 - 00:05] " on a dialogue line. Anchored to digits so a line
// that merely opens with a bracket (a writer's aside) is not mistaken for one.
const LEADING_TIMECODE_RE = /^\[(\d{1,2}:\d{2}(?:\s*[-–—]\s*\d{1,2}:\d{2})?)\]\s*/

// Reads the Doc and splits it into per-naskah raw text sections keyed by
// which naskah's named range each HEADING_1 paragraph falls inside. Falls
// back to the legacy visible `[[id:...]]` marker for a doc that was pushed
// before named-range tagging existed and hasn't been re-pushed since (the
// next push fully migrates it — every heading gets a fresh named range and
// the old in-text marker disappears for good).
export function parseDocIntoSections(doc: { body?: { content?: unknown[] }; namedRanges?: DocNamedRanges }): ParsedSection[] {
  const namedSpans: Array<{ start: number; end: number; id: string }> = []
  for (const entry of Object.values(doc.namedRanges || {})) {
    for (const nr of entry.namedRanges || []) {
      if (!nr.name) continue
      for (const r of nr.ranges || []) {
        if (typeof r.startIndex === 'number' && typeof r.endIndex === 'number') {
          namedSpans.push({ start: r.startIndex, end: r.endIndex, id: nr.name })
        }
      }
    }
  }
  const findNamedId = (elStart: number, elEnd: number): string | undefined =>
    namedSpans.find((s) => s.start >= elStart && s.start < elEnd)?.id

  const sections: ParsedSection[] = []
  let current: ParsedSection | null = null

  for (const el of doc.body?.content || []) {
    const node = el as {
      startIndex?: number
      endIndex?: number
      paragraph?: { paragraphStyle?: { namedStyleType?: string }; elements?: Array<{ textRun?: { content?: string } }> }
    }
    const paragraph = node.paragraph
    if (!paragraph) continue
    const text = (paragraph.elements || []).map((e) => e.textRun?.content || '').join('')
    const trimmed = text.replace(/\n$/, '')
    const isHeading = paragraph.paragraphStyle?.namedStyleType === 'HEADING_1'

    if (isHeading) {
      const naskahId =
        typeof node.startIndex === 'number' && typeof node.endIndex === 'number'
          ? findNamedId(node.startIndex, node.endIndex)
          : undefined
      const legacyId = naskahId ? undefined : trimmed.match(HEADING_ID_RE)?.[1]
      if (naskahId || legacyId) {
        current = { naskahId: (naskahId || legacyId) as string, lines: [] }
        sections.push(current)
        continue
      }
    }
    if (current && trimmed.trim()) current.lines.push(trimmed)
  }
  return sections
}

// Best-effort reconstruction of blocks from a section's raw lines. Lines
// matching our own rendered format recover their original shot/line/section;
// anything else (freely rewritten or newly added by the writer) becomes a
// fresh block with a NEW block_id — any QC flag on the old block_id becomes
// orphaned, same as any other structural edit (ARCHITECTURE.md §3).
export function reconstructBlocksFromLines(lines: string[]): Block[] {
  const blocks: Block[] = []
  let autoShot = 0
  let autoLine = 0

  for (const line of lines) {
    // Shot detail (📍/👔/🎬) — folds into the block it annotates. Dropped when
    // it has no block to attach to rather than becoming a block of its own,
    // which would read as the persona speaking the word "Laboratorium".
    const detailMatch = line.match(DETAIL_LINE_RE)
    if (detailMatch) {
      if (blocks.length > 0) {
        const key = DETAIL_KEY_BY_ICON[detailMatch[1]]
        blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], [key]: detailMatch[2] }
      }
      continue
    }

    const visualMatch = line.match(VISUAL_NOTE_RE)
    if (visualMatch && blocks.length > 0) {
      blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], visual_note: visualMatch[1] }
      continue
    }

    const match = line.match(STRUCTURED_LINE_RE)
    const input: BlockInput = match
      ? {
          shot_no: parseInt(match[1], 10),
          line_no: parseInt(match[2], 10),
          section_key: match[3].split(' ')[0], // strip a trailing timestamp_range if present
          timestamp_range: match[3].includes(' ') ? match[3].split(' ').slice(1).join(' ') : null,
          speaker: match[4] || null,
          text: match[5],
        }
      : (() => {
          autoShot += 1
          autoLine = 1
          // Strip the "[00:00 - 00:05] " push writes ahead of the dialogue and
          // put it back in the field it came from, instead of leaving the
          // timecode embedded in the spoken text.
          const timecode = line.match(LEADING_TIMECODE_RE)
          return {
            shot_no: autoShot,
            line_no: autoLine,
            section_key: 'body',
            speaker: null,
            timestamp_range: timecode ? timecode[1] : null,
            text: timecode ? line.slice(timecode[0].length) : line,
          }
        })()

    blocks.push({ ...input, block_id: generateBlockId() })
  }
  return blocks
}

