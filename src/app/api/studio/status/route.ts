// GET /api/studio/status — poll Video Studio for job status updates.
//
// Auth: normal Supabase session.
// Query: ?naskah_ids=id1,id2  (Caketing naskah IDs that were pushed)
//
// Fetches studio_handoff from naskah, then queries Video Studio for live status.

import { createServerClient } from '@/lib/supabase/server'
import { requirePageUser } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createServerClient()
  let user
  try {
    user = await requirePageUser(supabase)
  } catch {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const rawIds = searchParams.get('naskah_ids') || ''
  const naskahIds = rawIds.split(',').map(id => id.trim()).filter(Boolean)

  if (naskahIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'naskah_ids required' }, { status: 400 })
  }

  // Fetch studio connection settings
  const { data: settings } = await supabase
    .from('user_settings')
    .select('studio_api_key, studio_api_url')
    .eq('user_id', user.id)
    .maybeSingle()

  const studioUrl = settings?.studio_api_url
  const studioApiKey = settings?.studio_api_key
  if (!studioUrl || !studioApiKey) {
    return NextResponse.json({ ok: false, error: 'Studio integration not configured' }, { status: 400 })
  }

  // Fetch naskah with studio_handoff
  const { data: naskahRows } = await supabase
    .from('naskah')
    .select('id, studio_handoff')
    .in('id', naskahIds)
    .eq('created_by', user.id)

  if (!naskahRows || naskahRows.length === 0) {
    return NextResponse.json({ ok: false, error: 'No naskah found' }, { status: 404 })
  }

  // Collect all studio_job_ids
  const jobIdToNaskah = new Map<string, string>()
  for (const n of naskahRows) {
    const handoff = n.studio_handoff as { studio_job_ids?: string[] } | null
    if (handoff?.studio_job_ids) {
      for (const jid of handoff.studio_job_ids) {
        jobIdToNaskah.set(jid, n.id)
      }
    }
  }

  if (jobIdToNaskah.size === 0) {
    return NextResponse.json({
      ok: true,
      statuses: naskahIds.map(id => ({ naskah_id: id, studio_status: 'not_pushed' }))
    })
  }

  // Query Video Studio
  const allJobIds = [...jobIdToNaskah.keys()]
  try {
    const res = await fetch(
      `${studioUrl.replace(/\/$/, '')}/api/external/status?job_ids=${allJobIds.join(',')}`,
      { headers: { 'Authorization': `Bearer ${studioApiKey}` } }
    )

    const studioData = await res.json()

    if (!res.ok || !studioData.ok) {
      return NextResponse.json({
        ok: false,
        error: `Studio status query failed: ${studioData.error || res.statusText}`,
      }, { status: 502 })
    }

    // Build status map
    const jobStatuses = new Map<string, { id: string; status: string; result_urls?: any[] }>(
      (studioData.jobs || []).map((j: any) => [j.id, j])
    )

    // Update naskah.studio_handoff status if changed
    for (const n of naskahRows) {
      const handoff = n.studio_handoff as any
      if (!handoff?.studio_job_ids) continue

      const jobId = handoff.studio_job_ids[0]
      const studioJob = jobStatuses.get(jobId)
      if (!studioJob) continue

      // Map studio status to handoff status
      const statusMap: Record<string, string> = {
        pending: 'pushed',
        in_progress: 'generating',
        parsed: 'pushed',
        generating: 'generating',
        done: 'done',
        error: 'error',
        cancelled: 'error',
      }
      const newStatus = statusMap[studioJob.status] || 'pushed'

      if (handoff.status !== newStatus) {
        await supabase
          .from('naskah')
          .update({
            studio_handoff: { ...handoff, status: newStatus }
          })
          .eq('id', n.id)
          .eq('created_by', user.id)
      }
    }

    return NextResponse.json({
      ok: true,
      statuses: naskahRows.map(n => {
        const handoff = n.studio_handoff as any
        const jobId = handoff?.studio_job_ids?.[0]
        const studioJob = jobId ? jobStatuses.get(jobId) : null
        return {
          naskah_id: n.id,
          studio_status: studioJob?.status || 'not_pushed',
          result_urls: studioJob?.result_urls || [],
        }
      })
    })
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: `Failed to reach Video Studio: ${e instanceof Error ? e.message : String(e)}`,
    }, { status: 502 })
  }
}
