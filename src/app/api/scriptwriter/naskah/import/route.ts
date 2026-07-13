import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { getGeminiApiKey } from '@/lib/cakgpt/settings'
import { detectSourceKind, parseFileToText, extractNaskahFromText } from '@/lib/cakgpt/brief-extract'
import { getValidAccessToken } from '@/lib/cakgpt/google-oauth'
import { getDoc, docToPlainText, parseGoogleDocId } from '@/lib/cakgpt/google-docs'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB
// Aligned with MAX_EXTRACTION_SOURCE_LEN in prompts.ts so accepted text == text
// actually sent to the model (no silent truncation past this point).
const MAX_TEXT_CHARS = 120_000

// POST /api/naskah/import — split an uploaded document (or pasted text) that
// contains one or more FINISHED naskah into structured, block-mapped naskah.
// Returns a PREVIEW only; /import/commit persists them as real naskah + versions.
export async function POST(req: Request) {
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

  const contentType = (req.headers.get('content-type') || '').toLowerCase()
  const declaredLen = Number(req.headers.get('content-length') || '0')
  if (declaredLen > MAX_FILE_BYTES) return NextResponse.json({ ok: false, error: 'request too large (max 5 MB)' }, { status: 413 })

  let sourceText: string
  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file')
      if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'no file provided' }, { status: 400 })
      if (file.size === 0) return NextResponse.json({ ok: false, error: 'file is empty' }, { status: 400 })
      if (file.size > MAX_FILE_BYTES) return NextResponse.json({ ok: false, error: 'file too large (max 5 MB)' }, { status: 413 })
      const kind = detectSourceKind(file.name, file.type)
      if (!kind) return NextResponse.json({ ok: false, error: `unsupported file type: ${file.name}` }, { status: 415 })
      sourceText = await parseFileToText(Buffer.from(await file.arrayBuffer()), kind)
    } else {
      const body = await req.json().catch(() => ({}))
      if (typeof body.text === 'string' && body.text.trim()) {
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
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed to read source' }, { status: 400 })
  }

  const result = await extractNaskahFromText({ apiKey, text: sourceText })
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 422 })
  return NextResponse.json({ ok: true, naskah: result.naskah, count: result.naskah.length })
}
