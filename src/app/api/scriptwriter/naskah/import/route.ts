import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { getGeminiApiKey } from '@/lib/cakgpt/settings'
import { extractNaskahFromText } from '@/lib/cakgpt/brief-extract'
import { readSourceFromStorage } from '@/lib/cakgpt/import-storage'
import { getValidAccessToken } from '@/lib/cakgpt/google-oauth'
import { getDoc, docToPlainText, parseGoogleDocId } from '@/lib/cakgpt/google-docs'

export const runtime = 'nodejs'
export const maxDuration = 120

// Aligned with MAX_EXTRACTION_SOURCE_LEN in prompts.ts so accepted text == text
// actually sent to the model (no silent truncation past this point).
const MAX_TEXT_CHARS = 120_000

// POST /api/naskah/import — split an uploaded document (or pasted text) that
// contains one or more FINISHED naskah into structured, block-mapped naskah.
// Returns a PREVIEW only; /import/commit persists them as real naskah + versions.
//
// Outermost safety net: every path below already returns clean JSON on
// failure, but this catch-all guarantees the client never sees a raw,
// non-JSON 500 — it always gets a real, actionable error message instead.
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

  const service = createServiceClient()
  let apiKey: string
  try {
    apiKey = await getGeminiApiKey(service, user.id)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Gemini API key not configured' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))

  let sourceText: string
  try {
    if (typeof body.storage_path === 'string' && body.storage_path.trim()) {
      // Browser uploaded directly to Supabase Storage via a signed URL (see
      // /imports/upload-url) — bypasses Vercel's Serverless Function
      // request-body cap (hard 4.5 MB platform limit) entirely.
      sourceText = await readSourceFromStorage(service, body.storage_path)
    } else if (typeof body.text === 'string' && body.text.trim()) {
      if (body.text.length > MAX_TEXT_CHARS) return NextResponse.json({ ok: false, error: 'pasted text too large (max 120k chars)' }, { status: 413 })
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

  const result = await extractNaskahFromText({ apiKey, text: sourceText })
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 422 })
  return NextResponse.json({ ok: true, naskah: result.naskah, count: result.naskah.length })
}
