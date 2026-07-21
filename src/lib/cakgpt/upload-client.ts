'use client'

import { createBrowserSupabaseClient } from './supabase/client'

// App-level cap for import file uploads (briefs/naskah/image translation).
// Mirrors the sw-imports bucket's file_size_limit (see
// supabase/migrations/011_sw_imports_bucket.sql). Files this size skip
// Vercel's Serverless Function request-body cap entirely — they go straight
// to Supabase Storage via a signed upload URL.
export const MAX_IMPORT_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB

// Video (Content Translator) needs a much higher ceiling than documents/
// images. The sw-imports BUCKET allows up to 200 MB (migration 012), but
// Supabase enforces its own PROJECT-WIDE upload cap independent of any
// bucket's file_size_limit — empirically confirmed at exactly 50 MB on this
// project (Dashboard: Project Settings -> Storage -> "Upload file size
// limit"; Free-tier default, raisable on paid plans). Capping here to the
// REAL ceiling so the browser rejects an oversized file with the friendly
// Indonesian message below instead of Supabase's raw, confusing "The object
// exceeded the maximum allowed size" after a failed upload attempt. Raise
// this back toward 200 MB once the project's global limit is actually raised.
export const MAX_VIDEO_UPLOAD_BYTES = 45 * 1024 * 1024 // 45 MB (5 MB safety margin under the confirmed 50 MB project cap)

type UploadResult = { ok: true; path: string } | { ok: false; error: string }

// Upload a file for the briefs/naskah import (or Content Translator) flow:
// mint a one-time signed upload slot from our API, then send the file
// straight to Supabase Storage (browser → Storage directly, never through
// our Vercel function). Returns a storage path the caller can download +
// process + delete. `maxBytes` defaults to the document/image ceiling —
// pass MAX_VIDEO_UPLOAD_BYTES explicitly for video.
export async function uploadFileForImport(file: File, maxBytes: number = MAX_IMPORT_UPLOAD_BYTES): Promise<UploadResult> {
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: `File terlalu besar (${(file.size / 1024 / 1024).toFixed(1)} MB, maks ${maxBytes / 1024 / 1024} MB).`,
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
