import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'

const MAX_ITEMS = 200

// Triage queue (ARCHITECTURE.md §6): riskiest items first, zero-flag items
// sink to the bottom where bulk-approve targets them. One extra query for
// naskah_versions (to surface hook_type) + one for all open flags across the
// page, aggregated in JS — avoids an N+1 per naskah.
export async function GET(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const url = new URL(req.url)
  const batchId = url.searchParams.get('batch_id')
  const status = url.searchParams.get('status') || 'draft'
  const severityFilter = url.searchParams.get('severity')
  const categoryFilter = url.searchParams.get('category')

  let query = supabase
    .from('sw_naskah')
    .select('id, title, status, current_version_id, updated_at, persona_id, brief_id, day_no, created_at')
    .eq('created_by', user.id)
    .order('updated_at', { ascending: false })
    .limit(MAX_ITEMS)
  if (batchId) query = query.eq('batch_id', batchId)
  if (status && status !== 'all') query = query.eq('status', status)

  const { data: naskahRows, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!naskahRows || naskahRows.length === 0) return NextResponse.json({ ok: true, items: [] })

  const personaIds = [...new Set(naskahRows.map((n) => n.persona_id).filter(Boolean))] as string[]
  const { data: personaRows } = personaIds.length
    ? await supabase.from('sw_personas').select('id, name').in('id', personaIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const personaNameById = new Map((personaRows || []).map((p) => [p.id, p.name]))

  const versionIds = naskahRows.map((n) => n.current_version_id).filter(Boolean) as string[]

  const [{ data: versions }, { data: flags }] = await Promise.all([
    versionIds.length
      ? supabase.from('sw_naskah_versions').select('id, hook_rubric_id').in('id', versionIds)
      : Promise.resolve({ data: [] as Array<{ id: string; hook_rubric_id: string | null }> }),
    versionIds.length
      ? supabase.from('sw_qc_flags').select('naskah_version_id, severity, category').eq('status', 'open').in('naskah_version_id', versionIds)
      : Promise.resolve({ data: [] as Array<{ naskah_version_id: string; severity: string; category: string }> }),
  ])

  const hookRubricIds = [...new Set((versions || []).map((v) => v.hook_rubric_id).filter(Boolean))] as string[]
  const { data: hookRubrics } = hookRubricIds.length
    ? await supabase.from('sw_hook_rubrics').select('id, slug, name').in('id', hookRubricIds)
    : { data: [] as Array<{ id: string; slug: string; name: string }> }
  const hookRubricById = new Map((hookRubrics || []).map((h) => [h.id, h]))

  const versionById = new Map((versions || []).map((v) => [v.id, v]))
  const flagsByVersion = new Map<string, Array<{ severity: string; category: string }>>()
  for (const f of flags || []) {
    const list = flagsByVersion.get(f.naskah_version_id) || []
    list.push({ severity: f.severity, category: f.category })
    flagsByVersion.set(f.naskah_version_id, list)
  }

  let items = naskahRows.map((n) => {
    const versionFlags = n.current_version_id ? flagsByVersion.get(n.current_version_id) || [] : []
    const flagCounts = { blocker: 0, warning: 0, nit: 0 }
    for (const f of versionFlags) flagCounts[f.severity as keyof typeof flagCounts]++
    const version = n.current_version_id ? versionById.get(n.current_version_id) : null
    const hookRubric = version?.hook_rubric_id ? hookRubricById.get(version.hook_rubric_id) : null
    return {
      naskah_id: n.id,
      title: n.title,
      status: n.status,
      updated_at: n.updated_at,
      persona_name: n.persona_id ? personaNameById.get(n.persona_id) || null : null,
      hook_type: hookRubric?.slug || null,
      hook_name: hookRubric?.name || null,
      flag_counts: flagCounts,
      has_open_blockers: flagCounts.blocker > 0,
      _flags: versionFlags, // used for filtering below, stripped before response
      _briefId: n.brief_id,
      _dayNo: n.day_no,
      _createdAt: n.created_at,
    }
  })

  if (severityFilter) items = items.filter((i) => i._flags.some((f) => f.severity === severityFilter))
  if (categoryFilter) items = items.filter((i) => i._flags.some((f) => f.category === categoryFilter))

  // Risk-first ordering is deliberate (ARCHITECTURE.md §6) and unchanged: open
  // blockers float to the top, zero-flag items sink to where bulk-approve
  // targets them. Only the FINAL tiebreaker changed — it used to be "most
  // recently updated", which for a bulk run is just "whichever of the 12
  // concurrent jobs happened to finish last". That scattered a multi-day series
  // (Hari 3 above Hari 1, one persona's days interleaved with another's).
  // Equally-risky items now read in the order a human thinks about them:
  // topic → persona → day.
  // One fixed rank per topic, computed BEFORE sorting: the earliest naskah
  // created for that brief. Comparing each item's own created_at instead would
  // be an inconsistent comparator — two naskah of the same topic can sit on
  // either side of another topic's, so the "same brief" branch and the
  // timestamp branch would disagree and scramble the result.
  const briefRank = new Map<string, number>()
  for (const i of items) {
    if (!i._briefId) continue
    const t = new Date(i._createdAt).getTime()
    const cur = briefRank.get(i._briefId)
    if (cur === undefined || t < cur) briefRank.set(i._briefId, t)
  }

  items.sort((a, b) => {
    if (a.has_open_blockers !== b.has_open_blockers) return a.has_open_blockers ? -1 : 1
    if (a.flag_counts.blocker !== b.flag_counts.blocker) return b.flag_counts.blocker - a.flag_counts.blocker
    // Group a topic's naskah together. brief_id is opaque, so topics follow the
    // order their first naskah appeared (which tracks content-plan order).
    if (a._briefId !== b._briefId) {
      return (briefRank.get(a._briefId ?? '') ?? 0) - (briefRank.get(b._briefId ?? '') ?? 0)
    }
    const nameCmp = (a.persona_name || '').localeCompare(b.persona_name || '')
    if (nameCmp !== 0) return nameCmp
    // Days ascending (1,2,3…); single-day naskah (null) keep a stable slot.
    return (a._dayNo ?? 0) - (b._dayNo ?? 0)
  })

  return NextResponse.json({ ok: true, items: items.map(({ _flags, _briefId, _dayNo, _createdAt, ...rest }) => rest) })
}
