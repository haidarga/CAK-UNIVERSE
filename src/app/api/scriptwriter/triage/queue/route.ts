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
    .select('id, title, status, current_version_id, updated_at, persona_id')
    .eq('created_by', user.id)
    .eq('status', status)
    .order('updated_at', { ascending: false })
    .limit(MAX_ITEMS)
  if (batchId) query = query.eq('batch_id', batchId)

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
    }
  })

  if (severityFilter) items = items.filter((i) => i._flags.some((f) => f.severity === severityFilter))
  if (categoryFilter) items = items.filter((i) => i._flags.some((f) => f.category === categoryFilter))

  items.sort((a, b) => {
    if (a.has_open_blockers !== b.has_open_blockers) return a.has_open_blockers ? -1 : 1
    if (a.flag_counts.blocker !== b.flag_counts.blocker) return b.flag_counts.blocker - a.flag_counts.blocker
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })

  return NextResponse.json({ ok: true, items: items.map(({ _flags, ...rest }) => rest) })
}
