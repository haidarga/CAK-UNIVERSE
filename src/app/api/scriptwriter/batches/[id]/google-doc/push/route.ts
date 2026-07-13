import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { getValidAccessToken } from '@/lib/cakgpt/google-oauth'
import { createDoc, pushNaskahToDoc, getDocWebViewUrl } from '@/lib/cakgpt/google-docs'
import type { Block } from '@/lib/cakgpt/schemas'

// POST /api/batches/[id]/google-doc/push — creates the batch's Google Doc on
// first call, then full-rewrites its content from the current naskah every
// call after (ARCHITECTURE.md §9 / src/lib/google-docs.ts).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: batchId } = await params
  const authClient = await createServerClient()
  const { user, unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  const { data: batch } = await authClient.from('batches').select('*').eq('id', batchId).eq('created_by', user.id).maybeSingle()
  if (!batch) return NextResponse.json({ ok: false, error: 'batch not found' }, { status: 404 })

  const service = createServiceClient()
  let accessToken: string
  try {
    accessToken = await getValidAccessToken(service, user.id)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Google not connected', connect_url: '/api/scriptwriter/google/oauth/start' }, { status: 428 })
  }

  const { data: naskahRows, error: naskahErr } = await authClient
    .from('naskah').select('id, title, current_version_id').eq('batch_id', batchId).eq('created_by', user.id).order('created_at', { ascending: true })
  if (naskahErr) return NextResponse.json({ ok: false, error: naskahErr.message }, { status: 500 })

  const versionIds = (naskahRows || []).map((n) => n.current_version_id).filter(Boolean) as string[]
  const { data: versions } = versionIds.length
    ? await authClient.from('naskah_versions').select('id, body').in('id', versionIds)
    : { data: [] as Array<{ id: string; body: Block[] }> }
  const bodyByVersion = new Map((versions || []).map((v) => [v.id, v.body]))

  const naskahForDoc = (naskahRows || [])
    .filter((n) => n.current_version_id)
    .map((n) => ({ naskah_id: n.id, title: n.title, body: bodyByVersion.get(n.current_version_id!) || [] }))

  try {
    let docId: string | null = (batch.external_doc_ref as { doc_id?: string } | null)?.doc_id || null
    if (!docId) {
      const created = await createDoc(accessToken, batch.name)
      docId = created.documentId
    }

    await pushNaskahToDoc(accessToken, docId, naskahForDoc)

    const docUrl = await getDocWebViewUrl(docId)
    await authClient.from('batches').update({
      external_doc_ref: { doc_id: docId, doc_url: docUrl, last_pushed_at: new Date().toISOString() },
    }).eq('id', batchId).eq('created_by', user.id)

    return NextResponse.json({ ok: true, doc_id: docId, doc_url: docUrl, naskah_count: naskahForDoc.length })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'push failed' }, { status: 500 })
  }
}
