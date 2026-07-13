import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'

// Bulk-approve by severity threshold (ARCHITECTURE.md §6). Server re-validates
// flag state per naskah right before flipping status — never trust a stale
// client-side selection (the client may have fetched the queue before a
// background re-QC changed something).
export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const batchId = body.batch_id ? String(body.batch_id) : null
  const threshold = body.severity_threshold === 'blocker_only' ? 'blocker_only' : 'none'

  let draftQuery = supabase
    .from('sw_naskah').select('id, current_version_id').eq('created_by', user.id).eq('status', 'draft')
  if (batchId) draftQuery = draftQuery.eq('batch_id', batchId)
  const { data: drafts, error: draftErr } = await draftQuery
  if (draftErr) return NextResponse.json({ ok: false, error: draftErr.message }, { status: 500 })
  if (!drafts || drafts.length === 0) return NextResponse.json({ ok: true, approved: 0, skipped: 0 })

  const versionIds = drafts.map((d) => d.current_version_id).filter(Boolean) as string[]
  const { data: openFlags } = versionIds.length
    ? await supabase.from('sw_qc_flags').select('naskah_version_id, severity').eq('status', 'open').in('naskah_version_id', versionIds)
    : { data: [] as Array<{ naskah_version_id: string; severity: string }> }

  const flagsByVersion = new Map<string, string[]>()
  for (const f of openFlags || []) {
    const list = flagsByVersion.get(f.naskah_version_id) || []
    list.push(f.severity)
    flagsByVersion.set(f.naskah_version_id, list)
  }

  const eligibleIds: string[] = []
  for (const n of drafts) {
    const severities = n.current_version_id ? flagsByVersion.get(n.current_version_id) || [] : []
    const hasBlocker = severities.includes('blocker')
    const hasAny = severities.length > 0
    const eligible = threshold === 'blocker_only' ? !hasBlocker : !hasAny
    if (eligible) eligibleIds.push(n.id)
  }

  if (eligibleIds.length === 0) return NextResponse.json({ ok: true, approved: 0, skipped: drafts.length })

  const { error: updateErr } = await supabase
    .from('sw_naskah').update({ status: 'approved' }).in('id', eligibleIds).eq('created_by', user.id)
  if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, approved: eligibleIds.length, skipped: drafts.length - eligibleIds.length })
}
