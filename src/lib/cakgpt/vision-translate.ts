// Content Translator: one reference image -> a structured, reusable creative
// direction. Deliberately image-only for now — video needs Gemini's Files
// API (upload + poll until processing finishes), a meaningfully heavier lift
// than a single inline multimodal call. Not silently skipped: this is a
// stated, temporary scope cut, not a hidden gap.
import { callGeminiVisionJSON, LLMError } from '@/lib/cakgpt/llm'
import { buildVisualTranslationPrompt, VISUAL_TRANSLATION_RESPONSE_SCHEMA } from '@/lib/cakgpt/prompts'
import { VisualDirectionSchema, type VisualDirection } from '@/lib/cakgpt/schemas'

export type TranslateImageResult =
  | { ok: true; direction: VisualDirection }
  | { ok: false; error: string }

const SUPPORTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'])

export function isSupportedImageMime(mime: string): boolean {
  return SUPPORTED_MIME.has(mime.toLowerCase())
}

export async function translateImageToDirection(opts: {
  apiKey: string
  imageBase64: string
  mimeType: string
  note?: string
}): Promise<TranslateImageResult> {
  if (!isSupportedImageMime(opts.mimeType)) {
    return { ok: false, error: `unsupported image type: ${opts.mimeType}` }
  }
  try {
    const prompt = buildVisualTranslationPrompt({ note: opts.note })
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
    const msg = e instanceof LLMError ? e.message : e instanceof Error ? e.message : 'translation failed'
    if (/truncat|maxOutputTokens|Unterminated JSON|No JSON found/i.test(msg)) {
      return { ok: false, error: 'the analysis got cut off — try again.' }
    }
    return { ok: false, error: `translation failed: ${msg}` }
  }
}
