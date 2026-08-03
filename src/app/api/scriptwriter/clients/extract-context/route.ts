import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { getGeminiApiKey } from '@/lib/cakgpt/settings'
import { readSourceFromStorage } from '@/lib/cakgpt/import-storage'
import { extractBrandContext, type BrandExtractionSource } from '@/lib/cakgpt/brand-extract'
import { isBrandContextEmpty, riskyRuleEntries } from '@/lib/cakgpt/brand-context'
import { z } from 'zod'

// pdf/xlsx/docx parsing needs the Node runtime, not edge.
export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_TEXT_CHARS = 200_000

const BodySchema = z.object({
  source: z.enum(['brand_name', 'document', 'text']),
  brand_name: z.string().max(200).default(''),
  // 'text' mode — pasted prose, or an existing free-text `notes` being split.
  text: z.string().max(MAX_TEXT_CHARS).optional(),
  // 'document' mode — a path from /api/scriptwriter/imports/upload-url, so the
  // file went straight to Storage and never hit Vercel's 4.5MB body cap.
  storage_path: z.string().max(500).optional(),
})

// POST /api/scriptwriter/clients/extract-context
// Returns a PROPOSED Brand & Market Context for the writer to review. It is
// never persisted here: the client row is only written when the writer saves
// the form, so a bad extraction is discarded by simply not saving.
export async function POST(req: Request) {
  const authClient = await createServerClient()
  const { user, unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  let json: unknown
  try { json = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 })

  const { source, brand_name: brandName } = parsed.data
  if (source === 'brand_name' && !brandName.trim()) {
    return NextResponse.json({ ok: false, error: 'isi nama brand dulu sebelum minta AI nyari' }, { status: 400 })
  }

  const service = createServiceClient()

  let sourceText = ''
  if (source === 'document') {
    if (!parsed.data.storage_path) {
      return NextResponse.json({ ok: false, error: 'storage_path is required for a document' }, { status: 400 })
    }
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
  } else if (source === 'text') {
    sourceText = (parsed.data.text || '').trim()
    if (!sourceText) return NextResponse.json({ ok: false, error: 'teks sumbernya kosong' }, { status: 400 })
  }

  let apiKey: string
  try {
    apiKey = await getGeminiApiKey(service, user.id)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Gemini API key not configured' }, { status: 400 })
  }

  try {
    const context = await extractBrandContext({ apiKey, source, brandName, sourceText })

    // An all-empty result is the honest answer when the model does not know the
    // brand (brand_name mode has no web access). Say so plainly instead of
    // handing back nine blank boxes that look like a failure.
    if (isBrandContextEmpty(context)) {
      return NextResponse.json({
        ok: true,
        context,
        empty: true,
        message: source === 'brand_name'
          ? `AI gak kenal brand "${brandName}" dan sengaja gak nebak. Coba upload brand guideline-nya atau paste info yang lu punya.`
          : 'AI gak nemu info brand yang kepake di sumber ini.',
        risks: [],
      })
    }

    return NextResponse.json({
      ok: true,
      context,
      empty: false,
      // Surfaced immediately so a self-blocking rule is caught before the
      // writer saves it and every naskah for this brand starts failing QC.
      risks: riskyRuleEntries(context, brandName),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'ekstraksi gagal' }, { status: 500 })
  }
}
