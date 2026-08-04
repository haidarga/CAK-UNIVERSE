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

  const { data: batch } = await authClient.from('sw_batches').select('*').eq('id', batchId).eq('created_by', user.id).maybeSingle()
  if (!batch) return NextResponse.json({ ok: false, error: 'batch not found' }, { status: 404 })

  const service = createServiceClient()
  let accessToken: string
  try {
    accessToken = await getValidAccessToken(service, user.id)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Google not connected', connect_url: '/api/integrations/google/auth' }, { status: 428 })
  }

  // created_at is generation-COMPLETION order: jobs run 12-wide concurrently,
  // so a multi-day series lands scrambled (Hari 3 before Hari 1, personas
  // interleaved). A Doc is read top to bottom, so it's re-sorted below into the
  // order a human expects — topic → persona → day.
  const { data: naskahRows, error: naskahErr } = await authClient
    .from('sw_naskah').select('id, title, current_version_id, brief_id, persona_id, day_no, output_type, created_at')
    .eq('batch_id', batchId).eq('created_by', user.id).order('created_at', { ascending: true })
  if (naskahErr) return NextResponse.json({ ok: false, error: naskahErr.message }, { status: 500 })

  const versionIds = (naskahRows || []).map((n) => n.current_version_id).filter(Boolean) as string[]
  const { data: versions } = versionIds.length
    ? await authClient.from('sw_naskah_versions').select('id, body').in('id', versionIds)
    : { data: [] as Array<{ id: string; body: Block[] }> }
  const bodyByVersion = new Map((versions || []).map((v) => [v.id, v.body]))

  // Persona names for a readable (and stable) secondary sort — persona_id is
  // an opaque uuid, so sorting by it would group correctly but in a meaningless
  // order that also shuffles whenever personas are recreated.
  const personaIds = [...new Set((naskahRows || []).map((n) => n.persona_id).filter(Boolean))] as string[]
  const { data: personaRows } = personaIds.length
    ? await authClient.from('sw_personas').select('id, name').in('id', personaIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const personaNameById = new Map((personaRows || []).map((p) => [p.id, p.name]))

  // Fixed rank per topic (earliest naskah for that brief), computed before the
  // sort — comparing each row's own created_at inside the comparator would be
  // inconsistent, since two naskah of one topic can straddle another topic's.
  const briefRank = new Map<string, number>()
  for (const n of naskahRows || []) {
    if (!n.brief_id) continue
    const t = new Date(n.created_at).getTime()
    const cur = briefRank.get(n.brief_id)
    if (cur === undefined || t < cur) briefRank.set(n.brief_id, t)
  }

  const naskahForDoc = (naskahRows || [])
    .filter((n) => n.current_version_id)
    .sort((a, b) => {
      if (a.brief_id !== b.brief_id) {
        return (briefRank.get(a.brief_id ?? '') ?? 0) - (briefRank.get(b.brief_id ?? '') ?? 0)
      }
      const an = a.persona_id ? personaNameById.get(a.persona_id) || '' : ''
      const bn = b.persona_id ? personaNameById.get(b.persona_id) || '' : ''
      const nameCmp = an.localeCompare(bn)
      if (nameCmp !== 0) return nameCmp
      return (a.day_no ?? 0) - (b.day_no ?? 0)
    })
    .map((n) => ({ naskah_id: n.id, title: n.title, body: bodyByVersion.get(n.current_version_id!) || [], output_type: n.output_type }))

  try {
    let docId: string | null = (batch.external_doc_ref as { doc_id?: string } | null)?.doc_id || null
    if (!docId) {
      const created = await createDoc(accessToken, batch.name)
      docId = created.documentId
    }

    await pushNaskahToDoc(accessToken, docId, naskahForDoc)

    const docUrl = await getDocWebViewUrl(docId)
    await authClient.from('sw_batches').update({
      external_doc_ref: { doc_id: docId, doc_url: docUrl, last_pushed_at: new Date().toISOString() },
    }).eq('id', batchId).eq('created_by', user.id)

    return NextResponse.json({ ok: true, doc_id: docId, doc_url: docUrl, naskah_count: naskahForDoc.length })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'push failed' }, { status: 500 })
  }
}
