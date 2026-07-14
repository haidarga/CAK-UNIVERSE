// Content-plan file → plain text → LLM extraction → many structured briefs.
// Adapters turn each supported format into text the extractor can read; the
// extractor is the same Gemini-structured-output + Zod pattern used everywhere
// else (src/lib/llm.ts). Parsing runs server-side only (Node runtime).
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
// unpdf (not pdf-parse): pdf-parse pulls in pdfjs-dist's "legacy" build, which
// lazily requires the native @napi-rs/canvas binding for optional rendering
// features we never use (we only need TEXT). That binding's Linux binary
// doesn't reliably survive Vercel's serverless bundling, which crashed the
// whole function (FUNCTION_INVOCATION_FAILED) before our try/catch could ever
// run — no JS error handling can catch a module that fails to load. unpdf
// bundles its own pdf.js build with zero native/optional dependencies.
import { extractText, getDocumentProxy } from 'unpdf'
import { callGeminiJSON, LLMError } from '@/lib/cakgpt/llm'
import {
  buildBriefExtractionPrompt, BRIEF_EXTRACTION_RESPONSE_SCHEMA,
  buildNaskahExtractionPrompt, NASKAH_EXTRACTION_RESPONSE_SCHEMA,
} from '@/lib/cakgpt/prompts'
import { BriefExtractionOutputSchema, ImportedNaskahSchema, type ImportBrief, type ImportedNaskah } from '@/lib/cakgpt/schemas'

export type SourceKind = 'spreadsheet' | 'pdf' | 'docx' | 'text'

// Route a filename/mime to a parser kind. Returns null for unsupported types.
export function detectSourceKind(filename: string, mime: string): SourceKind | null {
  const ext = filename.toLowerCase().split('.').pop() || ''
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'spreadsheet'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (['txt', 'md'].includes(ext)) return 'text'
  // Fall back to mime sniffing when the extension is missing/unknown.
  if (mime.includes('spreadsheet') || mime === 'text/csv') return 'spreadsheet'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.includes('wordprocessingml')) return 'docx'
  if (mime.startsWith('text/')) return 'text'
  return null
}

// Render every sheet as CSV text so the extractor sees the row/column structure
// (one row per content idea is the common content-plan shape).
// `sheetRows` caps rows parsed per sheet — a crude but effective guard against a
// zip-bomb .xlsx (a small compressed file expanding to millions of cells) OOMing
// the parse. A content plan realistically has far fewer than 5000 rows.
const MAX_SHEET_ROWS = 5000
function spreadsheetToText(buffer: Buffer): string {
  const wb = XLSX.read(buffer, { type: 'buffer', sheetRows: MAX_SHEET_ROWS, cellFormula: false, cellHTML: false })
  return wb.SheetNames
    .map((name) => {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false })
      return `# Sheet: ${name}\n${csv}`
    })
    .join('\n\n')
}

export async function parseFileToText(buffer: Buffer, kind: SourceKind): Promise<string> {
  switch (kind) {
    case 'spreadsheet':
      return spreadsheetToText(buffer)
    case 'pdf': {
      const pdf = await getDocumentProxy(new Uint8Array(buffer))
      const { text } = await extractText(pdf, { mergePages: true })
      return text
    }
    case 'docx':
      // NOTE: mammoth decompresses the docx zip with no output-size cap; the
      // 5MB upload gate bounds the compressed input but not the expansion ratio.
      // Acceptable for this solo tool (writer uploads their own plans); revisit
      // with a streaming byte-budget if untrusted uploads ever become possible.
      return (await mammoth.extractRawText({ buffer })).value
    case 'text':
      return buffer.toString('utf8')
  }
}

export type ExtractBriefsResult =
  | { ok: true; briefs: ImportBrief[] }
  | { ok: false; error: string }

// Turn source text into reviewed-ready briefs. `fields` comes back from the
// model as a {key,value}[] (Gemini schema limitation) and is folded into a
// Record here; later duplicate keys win, empty keys/values are dropped.
// Split source text on LINE boundaries (never mid-row) into ~20k-char chunks,
// prepending the first line (a spreadsheet's header row) to each chunk so column
// context isn't lost. Small inputs return a single chunk (no overhead).
// Hard ceiling on how many chunks (= how many parallel LLM calls) one import
// can fan out into. Without this, a big-enough source (now allowed up to
// 10 MB post-upload — see supabase/migrations/011) produces an unbounded
// number of concurrent large-output LLM calls, which is slow, expensive, and
// prone to tripping provider rate limits or the route's own time budget —
// exactly the failure mode a large content-plan PDF can hit.
const MAX_CHUNKS = 40

function splitForExtraction(text: string, maxChars = 20000): string[] {
  if (text.length <= maxChars) return [text]
  const lines = text.split('\n')
  const header = lines[0] || ''
  const chunks: string[] = []
  let cur = ''
  for (const line of lines) {
    if (cur && cur.length + line.length + 1 > maxChars) {
      chunks.push(cur)
      cur = header && header !== line ? header : ''
    }
    cur += (cur ? '\n' : '') + line
  }
  if (cur.trim()) chunks.push(cur)
  return chunks.length ? chunks : [text]
}

// Run async tasks with at most `limit` in flight at once — bounds concurrent
// LLM calls instead of firing all chunks at the same time (Promise.all).
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function extractBriefsChunk(apiKey: string, text: string, hint?: string): Promise<ImportBrief[]> {
  const prompt = buildBriefExtractionPrompt({ sourceText: text, hint })
  const raw = await callGeminiJSON({ apiKey, prompt, responseSchema: BRIEF_EXTRACTION_RESPONSE_SCHEMA, temperature: 0.3, maxOutputTokens: 30000 })
  // Defensive: the responseSchema constrains the model to {briefs:[...]}, but
  // tolerate a bare array too (observed in production before responseSchema
  // was actually wired through) rather than crashing the whole import.
  const normalized = Array.isArray(raw) ? { briefs: raw } : raw
  const parsed = BriefExtractionOutputSchema.parse(normalized)
  return parsed.briefs.map((b) => {
    const fields: Record<string, string> = {}
    for (const { key, value } of b.fields) {
      const k = key.trim(); const v = value.trim()
      if (k && v) fields[k] = v
    }
    return { title: b.title.trim(), product: b.product?.trim() || null, platform: b.platform?.trim() || null, fields }
  }).filter((b) => b.title.length > 0)
}

export async function extractBriefsFromText(opts: { apiKey: string; text: string; hint?: string }): Promise<ExtractBriefsResult> {
  const trimmed = opts.text.trim()
  if (!trimmed) return { ok: false, error: 'the source is empty — nothing to extract' }

  try {
    const chunks = splitForExtraction(trimmed)
    if (chunks.length > MAX_CHUNKS) {
      return { ok: false, error: `this plan is too large to extract in one go (${chunks.length} sections, max ${MAX_CHUNKS}) — split the file and import in parts.` }
    }
    // Extract chunks with bounded concurrency — a handful in flight at once
    // cuts wall-time vs. one-at-a-time, without firing dozens of large-output
    // LLM calls simultaneously (rate limits, memory, time budget).
    const perChunk = await mapWithConcurrency(chunks, 4, (c) => extractBriefsChunk(opts.apiKey, c, opts.hint))

    // Merge; dedupe only EXACT duplicates (same title AND fields) — collapses the
    // repeated header row / any boundary artifact without dropping two real briefs
    // that happen to share a title on different days.
    const seen = new Set<string>()
    const briefs: ImportBrief[] = []
    for (const list of perChunk) {
      for (const b of list) {
        const dedupeKey = `${b.title.toLowerCase()}|${JSON.stringify(b.fields)}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey); briefs.push(b)
      }
    }
    if (briefs.length === 0) return { ok: false, error: 'no briefs found in that source' }
    return { ok: true, briefs: briefs.slice(0, 300) }
  } catch (e) {
    const msg = e instanceof LLMError ? e.message : e instanceof Error ? e.message : 'extraction failed'
    if (/truncat|maxOutputTokens/i.test(msg)) {
      return { ok: false, error: 'a section of this plan is too large to extract — try a smaller file.' }
    }
    return { ok: false, error: `extraction failed: ${msg}` }
  }
}

export type ExtractNaskahResult =
  | { ok: true; naskah: ImportedNaskah[] }
  | { ok: false; error: string }

// Salvage common model glitches (shot_no: 0, over-long text, an 81st block, a
// missing field) into a shape ImportedNaskahSchema will accept, so ONE bad line
// in script #38 doesn't discard a whole 40-script document. Anything still
// invalid after this (e.g. no usable text at all) gets dropped per-item, not
// all-or-nothing.
const MAX_BLOCKS_PER_NASKAH = 80
function normalizeNaskahItem(item: unknown): unknown {
  if (!item || typeof item !== 'object') return item
  const o = item as Record<string, unknown>
  const bodyIn = Array.isArray(o.body) ? o.body : []
  const toPosInt = (v: unknown, fallback: number) => {
    const n = typeof v === 'number' ? Math.floor(v) : parseInt(String(v), 10)
    return Number.isFinite(n) && n >= 1 ? n : fallback
  }
  const body = bodyIn.slice(0, MAX_BLOCKS_PER_NASKAH).map((b, i) => {
    const blk = (b && typeof b === 'object') ? (b as Record<string, unknown>) : {}
    return {
      section_key: typeof blk.section_key === 'string' && blk.section_key.trim() ? blk.section_key.slice(0, 60) : 'body',
      shot_no: toPosInt(blk.shot_no, i + 1),
      line_no: toPosInt(blk.line_no, 1),
      speaker: typeof blk.speaker === 'string' ? blk.speaker.slice(0, 60) : null,
      timestamp_range: typeof blk.timestamp_range === 'string' ? blk.timestamp_range.slice(0, 30) : null,
      text: typeof blk.text === 'string' ? blk.text.slice(0, 2000) : '',
      visual_note: typeof blk.visual_note === 'string' ? blk.visual_note.slice(0, 500) : null,
    }
  }).filter((b) => b.text.trim().length > 0) // text is required (min 1) — drop empty lines
  return { title: typeof o.title === 'string' ? o.title.trim().slice(0, 200) : '', body }
}

// Split one source document into many finished naskah, each mapped into blocks
// (words preserved). Larger output budget than brief extraction — a doc can hold
// dozens of full scripts; if it still truncates, the caller surfaces that so the
// writer can split the file.
export async function extractNaskahFromText(opts: { apiKey: string; text: string }): Promise<ExtractNaskahResult> {
  const trimmed = opts.text.trim()
  if (!trimmed) return { ok: false, error: 'the source is empty — nothing to import' }

  try {
    const prompt = buildNaskahExtractionPrompt({ sourceText: trimmed })
    const raw = await callGeminiJSON({
      apiKey: opts.apiKey,
      prompt,
      responseSchema: NASKAH_EXTRACTION_RESPONSE_SCHEMA,
      temperature: 0.1, // near-deterministic: this is structuring, not authoring
      maxOutputTokens: 32000,
    })

    // Per-item validation (NOT one hard .parse of the whole array): the Gemini
    // responseSchema doesn't enforce value bounds, so a single glitchy line
    // would otherwise throw away every correctly-extracted script. Normalize +
    // safeParse each naskah, keep the valid ones, drop the rest.
    const rawList: unknown[] = Array.isArray((raw as { naskah?: unknown })?.naskah) ? (raw as { naskah: unknown[] }).naskah : []
    const naskah: ImportedNaskah[] = []
    for (const item of rawList.slice(0, 40)) {
      const parsed = ImportedNaskahSchema.safeParse(normalizeNaskahItem(item))
      if (parsed.success) naskah.push(parsed.data)
    }
    if (naskah.length === 0) return { ok: false, error: 'no usable naskah found in that document' }
    return { ok: true, naskah }
  } catch (e) {
    const msg = e instanceof LLMError ? e.message : e instanceof Error ? e.message : 'extraction failed'
    return { ok: false, error: `naskah extraction failed: ${msg}` }
  }
}
