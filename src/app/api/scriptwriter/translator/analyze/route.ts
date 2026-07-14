import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { getGeminiApiKey } from '@/lib/cakgpt/settings'
import {
  translateImageToDirection, translateVideoToDirection,
  isSupportedImageMime, isSupportedVideoMime,
} from '@/lib/cakgpt/vision-translate'
import { withDeadline, DeadlineExceededError } from '@/lib/cakgpt/deadline'

export const runtime = 'nodejs'
// Video needs real headroom: Gemini Files API upload + PROCESSING->ACTIVE
// polling (up to ~2 min, see POLL_MAX_ATTEMPTS) + the analysis call itself.
// Hobby plan allows up to 300s — this stays under that with margin.
export const maxDuration = 280

const BUCKET = 'sw-imports' // same transient-upload bucket as briefs/naskah import
const IMAGE_DEADLINE_MS = 60_000
const VIDEO_DEADLINE_MS = 240_000
const MAX_NOTE_LEN = 1000

// POST /api/scriptwriter/translator/analyze — Content Translator. The image
// or video was already uploaded straight to Supabase Storage via a signed
// URL (same flow as briefs/naskah import — see /imports/upload-url); this
// route just receives the storage path, downloads + analyzes it, then
// deletes the file (transient, one-shot — never persisted).
//
// Outermost safety net: matches the import routes — any exception here still
// returns clean JSON instead of risking a raw platform error page.
export async function POST(req: Request) {
  try {
    return await handleAnalyze(req)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'unexpected server error' }, { status: 500 })
  }
}

async function handleAnalyze(req: Request) {
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
  const storagePath = typeof body.storage_path === 'string' ? body.storage_path.trim() : ''
  const mimeType = typeof body.mime_type === 'string' ? body.mime_type.trim() : ''
  const note = typeof body.note === 'string' ? body.note.slice(0, MAX_NOTE_LEN) : undefined

  if (!storagePath) return NextResponse.json({ ok: false, error: 'storage_path is required' }, { status: 400 })
  const isVideo = isSupportedVideoMime(mimeType)
  if (!isVideo && !isSupportedImageMime(mimeType)) {
    return NextResponse.json({ ok: false, error: `unsupported file type: ${mimeType || '(none)'}` }, { status: 415 })
  }

  let buffer: Buffer
  try {
    const { data, error } = await service.storage.from(BUCKET).download(storagePath)
    if (error || !data) throw new Error(error?.message || 'file not found in storage (may have expired)')
    buffer = Buffer.from(await data.arrayBuffer())
    if (buffer.length === 0) throw new Error('file is empty')
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed to read the uploaded file' }, { status: 400 })
  } finally {
    await service.storage.from(BUCKET).remove([storagePath]).catch(() => {})
  }

  try {
    const result = isVideo
      ? await withDeadline(
          translateVideoToDirection({ apiKey, videoBuffer: buffer, mimeType, note }),
          VIDEO_DEADLINE_MS,
          'video analysis',
        )
      : await withDeadline(
          translateImageToDirection({ apiKey, imageBase64: buffer.toString('base64'), mimeType, note }),
          IMAGE_DEADLINE_MS,
          'image analysis',
        )
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 422 })
    return NextResponse.json({ ok: true, direction: result.direction })
  } catch (e) {
    const msg = e instanceof DeadlineExceededError
      ? 'this analysis is taking too long — try again with a shorter/smaller file.'
      : e instanceof Error ? e.message : 'translation failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 504 })
  }
}
