import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { getActiveClientId } from '@/lib/cakgpt/active-client'
import { getGeminiApiKey } from '@/lib/cakgpt/settings'
import { getValidAccessToken } from '@/lib/cakgpt/google-oauth'
import { getDoc } from '@/lib/cakgpt/google-docs'
import { extractBriefsFromText, extractBriefsFromInstruction, extractHooksFromText, detectFileRole, type FileRole } from '@/lib/cakgpt/brief-extract'
import { readSourceFromStorage } from '@/lib/cakgpt/import-storage'
import { MAX_SOURCES, type HookBankItem } from '@/lib/cakgpt/schemas'
import { withDeadline, DeadlineExceededError } from '@/lib/cakgpt/deadline'

// File parsing (pdf/xlsx/docx) needs the Node runtime, not edge.
export const runtime = 'nodejs'
// A large content-plan source can fan out into several chunked LLM calls
// (see MAX_CHUNKS/mapWithConcurrency in brief-extract.ts) — give it real
// headroom. Hobby plan allows up to 300s; this stays comfortably under that.
export const maxDuration = 240

// Vercel kills the function OUTSIDE the JS call stack once maxDuration hits —
// no try/catch can intercept that, and the client is left with a raw,
// non-JSON error. These budgets self-impose a shorter deadline on EVERY slow
// step so OUR code always returns a clean, actionable JSON error BEFORE the
// platform would ever step in.
// Budgets are sized so the WORST case still lands under maxDuration (240s):
//   parse 60 + detect 15 + briefs 105 + hooks 35 = 215s, leaving ~25s for
//   auth/storage/response overhead. Parsing and detection are per-PHASE (all
//   sources run concurrently inside one budget), not per-file — a per-file
//   deadline multiplied by MAX_SOURCES would blow the ceiling on its own and
//   hand the caller a raw platform kill instead of a clean JSON error.
const PARSE_DEADLINE_MS = 60_000
const DETECT_DEADLINE_MS = 15_000
const EXTRACT_DEADLINE_MS = 105_000
const HOOK_DEADLINE_MS = 35_000

const MAX_TEXT_CHARS = 200_000 // paste / Google Doc source (bounds memory before extraction)

// Pull readable text out of a Google Doc, including table cells (content plans
// are often laid out as tables). Rows render pipe-separated so the extractor
// still sees column structure.
function docToPlainText(doc: { body?: { content?: unknown[] } }): string {
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

function parseGoogleDocId(input: string): string | null {
  const m = input.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  // Bare id (letters/digits/_/-, reasonable length)
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input.trim())) return input.trim()
  return null
}

// POST /api/briefs/import — extract briefs from an uploaded file, pasted text,
// or a Google Doc. Returns a PREVIEW only (nothing is written to the DB here);
// the writer reviews/edits, then /import/commit persists them.
//
// Outermost safety net: every code path below already returns a clean JSON
// error on failure, but this catch-all guarantees the CLIENT NEVER SEES A
// RAW, NON-JSON 500 — whatever throws, the browser gets `{ok:false,error}`
// with the real message instead of a dead-end "Server error" it can't act on.
export async function POST(req: Request) {
  try {
    return await handleImport(req)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'unexpected server error' }, { status: 500 })
  }
}

async function handleImport(req: Request) {
  const authClient = await createServerClient()
  const { user, unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  let apiKey: string
  const service = createServiceClient()
  try {
    apiKey = await getGeminiApiKey(service, user.id)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Gemini API key not configured' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const hint = typeof body.hint === 'string' ? body.hint : undefined

  // A run can now carry more than one file: a content plan AND the writer's own
  // hook bank. Each source is read to text first, then classified (or told) as
  // 'topics' vs 'hooks' — see detectFileRole. `storage_path`/`text`/`google_doc`
  // remain accepted as the single-source form so existing callers are unchanged.
  type Source = { label: string; text: string; role?: FileRole; roleFromClient: boolean }
  let sources: Source[] = []
  try {
    const rawList = Array.isArray(body.sources) ? body.sources : []
    if (rawList.length > MAX_SOURCES) {
      return NextResponse.json({ ok: false, error: `terlalu banyak file (${rawList.length}) — maks ${MAX_SOURCES} sekali import` }, { status: 400 })
    }
    const list = rawList
      .map((s: { storage_path?: unknown; filename?: unknown; role?: unknown }) => ({
        path: typeof s?.storage_path === 'string' ? s.storage_path.trim() : '',
        label: typeof s?.filename === 'string' && s.filename.trim() ? s.filename.trim() : 'file',
        role: s?.role === 'hooks' || s?.role === 'topics' ? (s.role as FileRole) : undefined,
      }))
      .filter((s: { path: string }) => s.path)

    // Parse every file CONCURRENTLY inside ONE budget. Sequentially, each with
    // its own PARSE_DEADLINE_MS, the worst case alone equalled maxDuration.
    if (list.length > 0) {
      const texts = await withDeadline(
        Promise.all(list.map((s: { path: string }) => readSourceFromStorage(service, s.path))),
        PARSE_DEADLINE_MS,
        'parsing the files',
      )
      sources = list.map((s: { label: string; role?: FileRole }, i: number) => ({
        label: s.label, text: texts[i], role: s.role, roleFromClient: !!s.role,
      }))
    }

    if (sources.length === 0) {
      if (typeof body.storage_path === 'string' && body.storage_path.trim()) {
        // Browser uploaded the file directly to Supabase Storage via a signed
        // URL (see /imports/upload-url) — this bypasses Vercel's Serverless
        // Function request-body cap (a hard 4.5 MB platform limit) entirely, so
        // much larger files (bucket allows up to 10 MB) work fine.
        const text = await withDeadline(readSourceFromStorage(service, body.storage_path), PARSE_DEADLINE_MS, 'parsing the file')
        sources.push({ label: typeof body.filename === 'string' ? body.filename : 'file', text, roleFromClient: false })
      } else if (typeof body.text === 'string' && body.text.trim()) {
        if (body.text.length > MAX_TEXT_CHARS) return NextResponse.json({ ok: false, error: 'pasted text too large (max 200k chars)' }, { status: 413 })
        // Pasted text and Google Docs are always the plan — the writer picked
        // that tab explicitly, so there is nothing to guess.
        sources.push({ label: 'pasted text', text: body.text, role: 'topics', roleFromClient: true })
      } else if (typeof body.google_doc === 'string' && body.google_doc.trim()) {
        const docId = parseGoogleDocId(body.google_doc)
        if (!docId) return NextResponse.json({ ok: false, error: 'could not read a Google Doc id from that input' }, { status: 400 })
        let accessToken: string
        try {
          accessToken = await getValidAccessToken(service, user.id)
        } catch (e) {
          return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Google not connected', connect_url: '/api/integrations/google/auth' }, { status: 428 })
        }
        const doc = await getDoc(accessToken, docId)
        sources.push({ label: 'Google Doc', text: docToPlainText(doc).slice(0, MAX_TEXT_CHARS), role: 'topics', roleFromClient: true })
      } else {
        return NextResponse.json({ ok: false, error: 'provide a file, text, or google_doc' }, { status: 400 })
      }
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed to read source' }, { status: 400 })
  }

  // Classify anything not explicitly labelled, all in parallel inside one
  // budget (each is one small LLM call at most, and usually zero — the filename
  // decides it). On timeout every unlabelled source falls back to 'topics',
  // matching detectFileRole's own fail-safe: classification is a convenience,
  // never a gate.
  try {
    const roles = await withDeadline(
      Promise.all(sources.map((s) => (s.role ? Promise.resolve(s.role) : detectFileRole({ apiKey, filename: s.label, text: s.text })))),
      DETECT_DEADLINE_MS,
      'detecting file types',
    )
    sources.forEach((s, i) => { s.role = roles[i] })
  } catch {
    sources.forEach((s) => { s.role = s.role || 'topics' })
  }

  // NOTE: a lone file used to be forced to 'topics' here, on the assumption
  // that without a plan file there was nothing to build briefs from. That was
  // wrong — uploading ONLY a hook bank and typing the topic in the instruction
  // is a first-class flow, and the coercion silently turned every hook line
  // into its own "brief" (12 hooks -> 12 topics). The topic can come from a
  // plan file OR from what the writer typed; see the fallback below.

  const topicText = sources.filter((s) => s.role === 'topics').map((s) => s.text).join('\n\n')
  const hookText = sources.filter((s) => s.role === 'hooks').map((s) => s.text).join('\n\n')
  const sourceText = topicText
  const detectedSources = sources.map((s) => ({ filename: s.label, role: s.role }))

  // Nothing to build briefs from at all: no plan file AND nothing typed.
  if (!topicText.trim() && !hint?.trim()) {
    return NextResponse.json({
      ok: false,
      error: detectedSources.length > 0
        ? `Nggak ada topik: file yang lu upload kebaca sebagai hook bank (${detectedSources.map((s) => s.filename).join(', ')}), dan kolom arahan kosong. Tulis topiknya di kolom arahan, atau upload file content plan-nya juga.`
        : 'Nggak ada topik — tulis topiknya di kolom arahan, atau upload file content plan.',
      sources: detectedSources,
    }, { status: 422 })
  }

  // Steer the extraction's "cluster" guess toward vocabulary that already
  // matches sw_personas.cluster (same shared-or-scoped visibility as the
  // personas list elsewhere) — otherwise a free-guessed "Dad" vs. an existing
  // "Dad Persona" tag would silently fail to match at generation time.
  const activeClient = await getActiveClientId()
  let clusterQuery = service.from('sw_personas').select('cluster').eq('created_by', user.id).eq('is_active', true).not('cluster', 'is', null)
  if (activeClient) clusterQuery = clusterQuery.or(`client_id.eq.${activeClient},client_id.is.null`)
  const { data: clusterRows } = await clusterQuery
  const knownClusters = [...new Set((clusterRows || []).map((r) => r.cluster).filter((c): c is string => !!c))].slice(0, 20)

  // Topic source: a plan file when there is one, otherwise what the writer
  // typed. The two use DIFFERENT prompts on purpose — the plan extractor is
  // built to split rows of a spreadsheet and would misread a one-line
  // assignment (that mismatch is what turned a 12-hook bank into 12 "briefs").
  let result: Awaited<ReturnType<typeof extractBriefsFromText>>
  try {
    result = topicText.trim()
      ? await withDeadline(extractBriefsFromText({ apiKey, text: sourceText, hint, knownClusters }), EXTRACT_DEADLINE_MS, 'extraction')
      : await withDeadline(extractBriefsFromInstruction({ apiKey, instruction: hint as string, knownClusters }), EXTRACT_DEADLINE_MS, 'extraction')
  } catch (e) {
    const msg = e instanceof DeadlineExceededError
      ? 'this plan is taking too long to extract — try a smaller file or split it into parts.'
      : e instanceof Error ? e.message : 'extraction failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 504 })
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 422 })

  // Hook bank is best-effort and never blocks the import: a failed/empty hook
  // file still leaves a perfectly good set of briefs to review, and the writer
  // sees which files were read as what in the preview.
  let hooks: HookBankItem[] = []
  let hookError: string | null = null
  if (hookText.trim()) {
    try {
      // Same knownClusters steering as the brief extraction above: the hook's
      // cluster tag is matched against sw_personas.cluster at generation time,
      // so "Dad" vs an existing "Dad Persona" would silently never line up.
      const hookRes = await withDeadline(extractHooksFromText({ apiKey, text: hookText, knownClusters }), HOOK_DEADLINE_MS, 'reading the hook bank')
      if (hookRes.ok) hooks = hookRes.hooks
      else hookError = hookRes.error
    } catch (e) {
      // Bounded like every other phase so a slow hook file can't push the whole
      // request past maxDuration and turn a successful brief import into a raw
      // platform kill.
      hookError = e instanceof DeadlineExceededError
        ? 'hook bank kelamaan dibaca — coba file yang lebih kecil'
        : e instanceof Error ? e.message : 'hook extraction failed'
    }
  }

  return NextResponse.json({
    ok: true,
    briefs: result.briefs,
    count: result.briefs.length,
    hooks,
    hook_error: hookError,
    sources: sources.map((s) => ({ filename: s.label, role: s.role })),
  })
}
