import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { getValidAccessToken } from '@/lib/cakgpt/google-oauth'
import { getDoc, getDocWebViewUrl, parseGoogleDocId } from '@/lib/cakgpt/google-docs'

// POST /api/batches/[id]/google-doc/link — point this batch at a Google Doc the
// writer already created (paste its URL/id) instead of creating a new one. After
// linking, Push writes the batch's naskah into THAT doc (full-rewrite — it
// overwrites the doc's current content) and Pull reads edits back from it.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: batchId } = await params
  const authClient = await createServerClient()
  const { user, unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  const { data: batch } = await authClient.from('sw_batches').select('id').eq('id', batchId).eq('created_by', user.id).maybeSingle()
  if (!batch) return NextResponse.json({ ok: false, error: 'batch not found' }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const docId = parseGoogleDocId(String(body.google_doc || ''))
  if (!docId) return NextResponse.json({ ok: false, error: 'could not read a Google Doc id from that input' }, { status: 400 })

  const service = createServiceClient()
  let accessToken: string
  try {
    accessToken = await getValidAccessToken(service, user.id)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Google not connected', connect_url: '/api/scriptwriter/google/oauth/start' }, { status: 428 })
  }

  // Confirm the caller's own token can actually open this doc before linking it.
  try {
    await getDoc(accessToken, docId)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? `can't open that doc: ${e.message}` : 'cannot open that doc' }, { status: 400 })
  }

  const docUrl = await getDocWebViewUrl(docId)
  const { error } = await authClient.from('sw_batches').update({
    external_doc_ref: { doc_id: docId, doc_url: docUrl, linked_at: new Date().toISOString() },
  }).eq('id', batchId).eq('created_by', user.id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, doc_id: docId, doc_url: docUrl })
}
