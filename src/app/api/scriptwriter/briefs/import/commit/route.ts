import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { ImportCommitSchema } from '@/lib/cakgpt/schemas'

// POST /api/briefs/import/commit — bulk-insert the reviewed briefs. Returns the
// created brief ids so the caller can immediately fan them out into naskah via
// /api/batches/[id]/generate (the "content plan → naskah per persona" flow).
export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let json: unknown
  try { json = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const parsed = ImportCommitSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid payload: expected { briefs: [...], client_id?, status? }' }, { status: 400 })
  const { briefs, status } = parsed.data

  // Verify the client belongs to this user before attaching it to every brief.
  let clientId: string | null = null
  if (parsed.data.client_id) {
    const { data: client } = await supabase
      .from('sw_clients').select('id').eq('id', parsed.data.client_id).eq('created_by', user.id).eq('is_active', true).maybeSingle()
    if (!client) return NextResponse.json({ ok: false, error: 'client not found' }, { status: 400 })
    clientId = client.id
  }

  // Auto-resolve each brief's default persona from its cluster tag, so
  // generation never hits "no persona specified" for a brief the writer never
  // manually assigns a persona to. Only auto-assign when the cluster maps to
  // EXACTLY ONE active persona (same shared-or-scoped visibility as the
  // personas list elsewhere) — ambiguous (0 or 2+) matches are left null
  // rather than guessing wrong.
  let personaQuery = supabase.from('sw_personas').select('id, cluster').eq('created_by', user.id).eq('is_active', true).not('cluster', 'is', null)
  if (clientId) personaQuery = personaQuery.or(`client_id.eq.${clientId},client_id.is.null`)
  const { data: personaRows } = await personaQuery
  const personaIdsByCluster = new Map<string, string[]>()
  for (const p of personaRows || []) {
    if (!p.cluster) continue
    const key = p.cluster.trim().toLowerCase()
    const list = personaIdsByCluster.get(key) || []
    list.push(p.id)
    personaIdsByCluster.set(key, list)
  }

  const importGroup = parsed.data.import_label?.trim() || null
  const rows = briefs.map((b) => {
    const clusterKey = b.cluster?.trim().toLowerCase()
    const matches = clusterKey ? personaIdsByCluster.get(clusterKey) : undefined
    return {
      created_by: user.id,
      title: b.title,
      product: b.product ?? null,
      platform: b.platform ?? null,
      cluster: b.cluster?.trim() || null,
      persona_id: matches?.length === 1 ? matches[0] : null,
      client_id: clientId,
      fields: b.fields ?? {},
      status,
      import_group: importGroup,
    }
  })

  const { data, error } = await supabase.from('sw_strategist_briefs').insert(rows).select('id, cluster')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // `briefs` pairs each id with ITS OWN row's cluster (same returned row, not a
  // separately-indexed array) — the caller's fan-out reads cluster from here,
  // never by re-indexing into its own possibly-stale/reordered client state.
  // brief_ids kept for any other consumer that only needs the ids.
  return NextResponse.json({
    ok: true,
    brief_ids: (data || []).map((r) => r.id),
    briefs: (data || []).map((r) => ({ id: r.id, cluster: r.cluster as string | null })),
    count: data?.length || 0,
  })
}
