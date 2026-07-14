import type { SupabaseClient } from '@supabase/supabase-js'
import { detectSourceKind, parseFileToText } from './brief-extract'

const BUCKET = 'sw-imports'

// Download a browser-uploaded file from the sw-imports bucket, parse it to
// text, then ALWAYS delete the object — these files are one-shot import
// sources, never meant to persist. Uploading here (rather than posting the
// file straight to the API route) is what lets big files skip Vercel's
// Serverless Function request-body cap (a hard 4.5 MB platform limit): the
// browser talks to Supabase Storage directly via a signed upload URL, and
// this route only ever receives a small JSON body with the storage path.
export async function readSourceFromStorage(
  service: SupabaseClient,
  storagePath: string,
): Promise<string> {
  try {
    const { data, error } = await service.storage.from(BUCKET).download(storagePath)
    if (error || !data) throw new Error(error?.message || 'file not found in storage (may have expired)')

    // Storage doesn't reliably give us the original mime type back, so lean
    // on the extension — detectSourceKind already prefers that anyway.
    const kind = detectSourceKind(storagePath, '')
    if (!kind) throw new Error(`unsupported file type: ${storagePath}`)

    const buffer = Buffer.from(await data.arrayBuffer())
    if (buffer.length === 0) throw new Error('file is empty')

    return await parseFileToText(buffer, kind)
  } finally {
    // Best-effort cleanup — a stray orphaned object (rare: only on a crash
    // between upload and this call) is harmless and low-volume, not worth
    // failing the request over.
    await service.storage.from(BUCKET).remove([storagePath]).catch(() => {})
  }
}
