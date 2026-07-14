import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { getGeminiApiKey } from '@/lib/cakgpt/settings'
import { getValidAccessToken } from '@/lib/cakgpt/google-oauth'
import { getDoc } from '@/lib/cakgpt/google-docs'
import { extractBriefsFromText } from '@/lib/cakgpt/brief-extract'
import { readSourceFromStorage } from '@/lib/cakgpt/import-storage'

// File parsing (pdf/xlsx/docx) needs the Node runtime, not edge.
export const runtime = 'nodejs'
// A large content-plan source can fan out into several chunked LLM calls
// (see MAX_CHUNKS/mapWithConcurrency in brief-extract.ts) — give it real
// headroom. Hobby plan allows up to 300s; this stays comfortably under that.
export const maxDuration = 180

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

  let sourceText: string
  try {
    if (typeof body.storage_path === 'string' && body.storage_path.trim()) {
      // Browser uploaded the file directly to Supabase Storage via a signed
      // URL (see /imports/upload-url) — this bypasses Vercel's Serverless
      // Function request-body cap (a hard 4.5 MB platform limit) entirely, so
      // much larger files (bucket allows up to 10 MB) work fine.
      sourceText = await readSourceFromStorage(service, body.storage_path)
    } else if (typeof body.text === 'string' && body.text.trim()) {
      if (body.text.length > MAX_TEXT_CHARS) return NextResponse.json({ ok: false, error: 'pasted text too large (max 200k chars)' }, { status: 413 })
      sourceText = body.text
    } else if (typeof body.google_doc === 'string' && body.google_doc.trim()) {
      const docId = parseGoogleDocId(body.google_doc)
      if (!docId) return NextResponse.json({ ok: false, error: 'could not read a Google Doc id from that input' }, { status: 400 })
      let accessToken: string
      try {
        accessToken = await getValidAccessToken(service, user.id)
      } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Google not connected', connect_url: '/api/scriptwriter/google/oauth/start' }, { status: 428 })
      }
      const doc = await getDoc(accessToken, docId)
      sourceText = docToPlainText(doc).slice(0, MAX_TEXT_CHARS)
    } else {
      return NextResponse.json({ ok: false, error: 'provide a file, text, or google_doc' }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed to read source' }, { status: 400 })
  }

  const result = await extractBriefsFromText({ apiKey, text: sourceText, hint })
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 422 })
  return NextResponse.json({ ok: true, briefs: result.briefs, count: result.briefs.length })
}
