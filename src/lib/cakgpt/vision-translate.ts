// Content Translator: one reference image OR video -> a structured, reusable
// creative direction.
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { callGeminiVisionJSON, LLMError } from '@/lib/cakgpt/llm'
import { buildVisualTranslationPrompt, VISUAL_TRANSLATION_RESPONSE_SCHEMA } from '@/lib/cakgpt/prompts'
import { VisualDirectionSchema, type VisualDirection } from '@/lib/cakgpt/schemas'

export type TranslateResult =
  | { ok: true; direction: VisualDirection }
  | { ok: false; error: string }
export type TranslateImageResult = TranslateResult

const SUPPORTED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'])
const SUPPORTED_VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/mpeg'])

export function isSupportedImageMime(mime: string): boolean {
  return SUPPORTED_IMAGE_MIME.has(mime.toLowerCase())
}
export function isSupportedVideoMime(mime: string): boolean {
  return SUPPORTED_VIDEO_MIME.has(mime.toLowerCase())
}

// Shared across image/video: turn a thrown error into a result the UI can
// show directly. Truncation ("Unterminated JSON"/"No JSON found" — extractJson's
// own errors, see src/lib/llm.ts) means the model's response got cut off
// mid-write, not a real content problem — surfaced as a retry-friendly message.
function toTranslateError(e: unknown): TranslateResult {
  const msg = e instanceof LLMError ? e.message : e instanceof Error ? e.message : 'translation failed'
  if (/truncat|maxOutputTokens|Unterminated JSON|No JSON found/i.test(msg)) {
    return { ok: false, error: 'the analysis got cut off — try again.' }
  }
  return { ok: false, error: `translation failed: ${msg}` }
}

export async function translateImageToDirection(opts: {
  apiKey: string
  imageBase64: string
  mimeType: string
  note?: string
}): Promise<TranslateResult> {
  if (!isSupportedImageMime(opts.mimeType)) {
    return { ok: false, error: `unsupported image type: ${opts.mimeType}` }
  }
  try {
    const prompt = buildVisualTranslationPrompt({ note: opts.note, mediaKind: 'image' })
    const raw = await callGeminiVisionJSON({
      apiKey: opts.apiKey,
      prompt,
      images: [{ mimeType: opts.mimeType, data: opts.imageBase64 }],
      responseSchema: VISUAL_TRANSLATION_RESPONSE_SCHEMA,
      temperature: 0.4,
      maxOutputTokens: 8000,
    })
    const direction = VisualDirectionSchema.parse(raw)
    return { ok: true, direction }
  } catch (e) {
    return toTranslateError(e)
  }
}

// Video needs Gemini's Files API: the clip is uploaded to Google's own file
// storage (Vercel's function body cap doesn't apply — we read it from OUR
// storage server-side, not the incoming request), Google processes it
// (PROCESSING -> ACTIVE, not instant), then a normal generateContent call
// references it by URI. Cleans up the temp file, the Gemini-side file, AND
// the Supabase-side upload (caller's job) regardless of outcome.
const POLL_INTERVAL_MS = 3_000
const POLL_MAX_ATTEMPTS = 40 // ~2 minutes of polling headroom

export async function translateVideoToDirection(opts: {
  // NOT used for auth — see note below. Kept in the signature to mirror
  // translateImageToDirection's shape (both take the CAKGPT-shim "apiKey",
  // which is always the literal string "ecosystem-managed" — see
  // src/lib/cakgpt/settings.ts — a placeholder that only the runLLM/
  // callGeminiJSON indirection knows to ignore in favor of the real
  // process.env.GEMINI_API_KEY read server-side).
  apiKey: string
  videoBuffer: Buffer
  mimeType: string
  note?: string
}): Promise<TranslateResult> {
  if (!isSupportedVideoMime(opts.mimeType)) {
    return { ok: false, error: `unsupported video type: ${opts.mimeType}` }
  }

  // The Files API (GoogleAIFileManager/GoogleGenerativeAI) is called DIRECTLY
  // here, bypassing the runLLM/callGeminiJSON indirection that all other
  // CAKGPT LLM calls go through — so unlike those, this path actually USES
  // whatever key it's given. opts.apiKey is the CAKGPT-shim placeholder
  // ("ecosystem-managed"), not a real key; read the real one straight from
  // env, matching how the ecosystem's own gemini() singleton does it.
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { ok: false, error: 'GEMINI_API_KEY is not set' }

  const ext = opts.mimeType.split('/')[1]?.replace('quicktime', 'mov') || 'mp4'
  const tempPath = join(tmpdir(), `translator-${randomUUID()}.${ext}`)
  const fileManager = new GoogleAIFileManager(apiKey)
  let geminiFileName: string | null = null

  try {
    await writeFile(tempPath, opts.videoBuffer)

    const uploaded = await fileManager.uploadFile(tempPath, { mimeType: opts.mimeType, displayName: 'content-translator-upload' })
    geminiFileName = uploaded.file.name

    let file = uploaded.file
    let attempts = 0
    while (file.state === FileState.PROCESSING) {
      if (attempts++ >= POLL_MAX_ATTEMPTS) {
        return { ok: false, error: 'video is taking too long to process — try a shorter clip.' }
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      file = await fileManager.getFile(geminiFileName)
    }
    if (file.state === FileState.FAILED) {
      return { ok: false, error: 'Google could not process this video — try a different clip or format.' }
    }

    const prompt = buildVisualTranslationPrompt({ note: opts.note, mediaKind: 'video' })
    const client = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      generationConfig: {
        maxOutputTokens: 8000,
        temperature: 0.4,
        responseMimeType: 'application/json',
        // The SDK's ResponseSchema type wants the SchemaType enum, but our
        // schema constants use plain string literals ('OBJECT', 'ARRAY', ...)
        // — the actual REST API accepts these fine (proven in runGemini(),
        // where the same object flows through a loosely-typed `object` field).
        responseSchema: VISUAL_TRANSLATION_RESPONSE_SCHEMA as unknown as import('@google/generative-ai').ResponseSchema,
      },
    })
    const res = await client.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ fileData: { fileUri: file.uri, mimeType: file.mimeType } }, { text: prompt }],
        },
      ],
    })

    const raw = JSON.parse(res.response.text())
    const direction = VisualDirectionSchema.parse(raw)
    return { ok: true, direction }
  } catch (e) {
    return toTranslateError(e)
  } finally {
    await unlink(tempPath).catch(() => {})
    if (geminiFileName) await fileManager.deleteFile(geminiFileName).catch(() => {})
  }
}
