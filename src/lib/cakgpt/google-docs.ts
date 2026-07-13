// Google Docs API wrapper + the naskah <-> Doc text rendering/parsing used by
// Phase 2 Milestone 4 (ARCHITECTURE.md §9). This is a deliberately simple
// FULL-REWRITE sync, not a rich structural round-trip:
//   - Push: re-renders every naskah in a batch as plain text into the Doc,
//     clearing whatever was there before. Each naskah gets a heading line
//     carrying a `[[id:<naskah_id>]]` marker so pull can re-identify it.
//   - Pull: re-parses the Doc's plain text back into blocks on a best-effort
//     basis (regex against the "shot.line (section): text" format we wrote).
//     Lines the writer reformatted freely become new blocks with fresh
//     block_ids — this deliberately reuses the same "structural edit orphans
//     the old flag" behavior already designed into the manual-edit path
//     (see qc_flags target_ref / ARCHITECTURE.md §3), not a new hack.
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
  const m = input.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
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

function renderNaskahText(n: NaskahForDoc): string {
  let text = `${n.title || 'Untitled naskah'} [[id:${n.naskah_id}]]\n`
  for (const block of n.body) {
    const speaker = block.speaker ? `${block.speaker}: ` : ''
    const ts = block.timestamp_range ? ` ${block.timestamp_range}` : ''
    text += `${block.shot_no}.${block.line_no} (${block.section_key}${ts}): ${speaker}${block.text}\n`
    if (block.visual_note) text += `   [${block.visual_note}]\n`
  }
  return text + '\n'
}

// Clears the doc's current body and rewrites it from the given naskah list.
export async function pushNaskahToDoc(accessToken: string, documentId: string, naskahList: NaskahForDoc[]): Promise<void> {
  const current = await getDoc(accessToken, documentId)
  const endIndex: number = current?.body?.content?.[current.body.content.length - 1]?.endIndex || 1

  const requests: unknown[] = []
  if (endIndex > 2) {
    requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } })
  }

  let fullText = ''
  const headingRanges: Array<{ start: number; end: number }> = []
  for (const n of naskahList) {
    const start = fullText.length
    const rendered = renderNaskahText(n)
    fullText += rendered
    const headingEnd = start + rendered.indexOf('\n')
    headingRanges.push({ start, end: headingEnd })
  }
  if (fullText.length === 0) fullText = '(no naskah in this batch yet)\n'

  requests.push({ insertText: { location: { index: 1 }, text: fullText } })
  for (const r of headingRanges) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: 1 + r.start, endIndex: 1 + r.end },
        paragraphStyle: { namedStyleType: 'HEADING_1' },
        fields: 'namedStyleType',
      },
    })
  }

  await batchUpdateDoc(accessToken, documentId, requests)
}

type ParsedSection = { naskahId: string; lines: string[] }

const HEADING_ID_RE = /\[\[id:([0-9a-fA-F-]{36})\]\]/
const STRUCTURED_LINE_RE = /^(\d+)\.(\d+)\s*\(([^)]+)\):\s*(?:([^:]+):\s*)?(.*)$/
const VISUAL_NOTE_RE = /^\s*\[(.+)\]\s*$/

// Reads the Doc and splits it into per-naskah raw text sections keyed by the
// [[id:...]] marker in each HEADING_1 paragraph.
export function parseDocIntoSections(doc: { body?: { content?: unknown[] } }): ParsedSection[] {
  const sections: ParsedSection[] = []
  let current: ParsedSection | null = null

  for (const el of doc.body?.content || []) {
    const paragraph = (el as { paragraph?: { paragraphStyle?: { namedStyleType?: string }; elements?: Array<{ textRun?: { content?: string } }> } }).paragraph
    if (!paragraph) continue
    const text = (paragraph.elements || []).map((e) => e.textRun?.content || '').join('')
    const trimmed = text.replace(/\n$/, '')
    const isHeading = paragraph.paragraphStyle?.namedStyleType === 'HEADING_1'

    if (isHeading) {
      const match = trimmed.match(HEADING_ID_RE)
      if (match) {
        current = { naskahId: match[1], lines: [] }
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
          return { shot_no: autoShot, line_no: autoLine, section_key: 'body', speaker: null, timestamp_range: null, text: line }
        })()

    blocks.push({ ...input, block_id: generateBlockId() })
  }
  return blocks
}

