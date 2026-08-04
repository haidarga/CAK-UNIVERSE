import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { getGeminiApiKey } from '@/lib/cakgpt/settings'
import { readSourceFromStorage } from '@/lib/cakgpt/import-storage'
import { extractPakem } from '@/lib/cakgpt/pakem-extract'
import { isPakemEmpty } from '@/lib/cakgpt/script-pakem'
import { z } from 'zod'

// pdf/docx parsing needs the Node runtime, not edge.
export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_TEXT_CHARS = 100_000

const BodySchema = z.object({
  // Pasted script, or a storage path from /imports/upload-url when the writer
  // uploaded a PDF/DOCX instead.
  text: z.string().max(MAX_TEXT_CHARS).optional(),
  storage_path: z.string().max(500).optional(),
})

// POST /api/scriptwriter/pakem/extract
// Returns a PROPOSED structure for the writer to review and edit. Nothing is
// persisted here — saving is a separate POST to /api/scriptwriter/pakem, so a
// bad extraction is discarded by simply not saving it.
export async function POST(req: Request) {
  const authClient = await createServerClient()
  const { user, unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  let json: unknown
  try { json = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 })

  const service = createServiceClient()

  let sourceText = (parsed.data.text || '').trim()
  if (!sourceText && parsed.data.storage_path) {
    // Path traversal / cross-user read guard: upload-url always namespaces the
    // path under the caller's own user id, so anything else is not theirs.
    if (!parsed.data.storage_path.startsWith(`${user.id}/`)) {
      return NextResponse.json({ ok: false, error: 'file not found' }, { status: 404 })
    }
    try {
      sourceText = await readSourceFromStorage(service, parsed.data.storage_path)
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'gagal baca file' }, { status: 400 })
    }
  }
  if (!sourceText.trim()) {
    return NextResponse.json({ ok: false, error: 'paste script contohnya atau upload dokumennya dulu' }, { status: 400 })
  }

  let apiKey: string
  try {
    apiKey = await getGeminiApiKey(service, user.id)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Gemini API key not configured' }, { status: 400 })
  }

  try {
    const structure = await extractPakem({ apiKey, sourceText })
    if (isPakemEmpty(structure)) {
      return NextResponse.json({
        ok: true, structure, empty: true,
        message: 'AI gak nemu struktur yang jelas di script ini — mungkin kependekan atau bukan naskah. Isi manual aja di bawah.',
      })
    }
    return NextResponse.json({
      ok: true,
      structure,
      empty: false,
      // Echoed back so saving keeps the reference, letting the writer re-run the
      // extraction later without re-uploading the document.
      source_excerpt: sourceText.slice(0, 20_000),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'ekstraksi gagal' }, { status: 500 })
  }
}
