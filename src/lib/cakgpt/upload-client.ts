'use client'

import { createBrowserSupabaseClient } from './supabase/client'

// App-level cap for import file uploads. Mirrors the sw-imports bucket's
// file_size_limit (see supabase/migrations/011_sw_imports_bucket.sql).
// Files this size skip Vercel's Serverless Function request-body cap
// entirely — they go straight to Supabase Storage via a signed upload URL.
export const MAX_IMPORT_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB

type UploadResult = { ok: true; path: string } | { ok: false; error: string }

// Upload a file for the briefs/naskah import flow: mint a one-time signed
// upload slot from our API, then send the file straight to Supabase Storage
// (browser → Storage directly, never through our Vercel function). Returns a
// storage path the import route can download + parse + delete.
export async function uploadFileForImport(file: File): Promise<UploadResult> {
  if (file.size > MAX_IMPORT_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `File terlalu besar (${(file.size / 1024 / 1024).toFixed(1)} MB, maks ${MAX_IMPORT_UPLOAD_BYTES / 1024 / 1024} MB) — coba Paste text atau Google Doc.`,
    }
  }

  let urlRes: Response
  try {
    urlRes = await fetch('/api/scriptwriter/imports/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name }),
    })
  } catch {
    return { ok: false, error: 'network error while preparing upload' }
  }
  const urlData = await urlRes.json().catch(() => ({ ok: false, error: 'invalid response preparing upload' }))
  if (!urlData.ok) return { ok: false, error: urlData.error || 'failed to prepare upload' }

  const supabase = createBrowserSupabaseClient()
  const { error: upErr } = await supabase.storage
    .from('sw-imports')
    .uploadToSignedUrl(urlData.path, urlData.token, file)
  if (upErr) return { ok: false, error: `upload failed: ${upErr.message}` }

  return { ok: true, path: urlData.path as string }
}
