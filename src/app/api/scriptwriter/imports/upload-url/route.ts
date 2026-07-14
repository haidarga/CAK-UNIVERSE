import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'

export const runtime = 'nodejs'

const BUCKET = 'sw-imports'
const MAX_FILENAME_LEN = 200

// POST /api/scriptwriter/imports/upload-url — mint a one-time signed upload
// slot so the browser can send the file DIRECTLY to Supabase Storage,
// bypassing Vercel's Serverless Function request-body cap (a hard 4.5 MB
// platform limit, not something app code can raise) entirely. Shared by the
// briefs and naskah import flows — both just need a storage path back.
export async function POST(req: Request) {
  const authClient = await createServerClient()
  const { user, unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  const body = await req.json().catch(() => ({}))
  const filename = typeof body.filename === 'string' ? body.filename.trim() : ''
  if (!filename) return NextResponse.json({ ok: false, error: 'filename is required' }, { status: 400 })
  if (filename.length > MAX_FILENAME_LEN) {
    return NextResponse.json({ ok: false, error: 'filename too long' }, { status: 400 })
  }

  // Namespace by user + a random id so concurrent imports never collide and
  // nothing is guessable/overwritable across requests.
  const ext = (filename.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`

  const service = createServiceClient()
  const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message || 'failed to prepare upload' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, path: data.path, token: data.token })
}
