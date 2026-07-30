// GET /api/studio/status — poll Video Studio for job status updates.
// Compatible with both sw_ (cakai-ecosystem) and standard schemas.

import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const rawIds = searchParams.get('naskah_ids') || ''
  const naskahIds = rawIds.split(',').map(id => id.trim()).filter(Boolean)

  if (naskahIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'naskah_ids required' }, { status: 400 })
  }

  // Fetch studio connection settings (sw_user_settings fallback user_settings)
  let { data: settings } = await supabase
    .from('sw_user_settings')
    .select('studio_api_key, studio_api_url')
    .eq('created_by', user.id)
    .maybeSingle()

  if (!settings?.studio_api_key) {
    const { data: legacySettings } = await supabase
      .from('user_settings')
      .select('studio_api_key, studio_api_url')
      .eq('user_id', user.id)
      .maybeSingle()
    if (legacySettings) settings = legacySettings
  }

  let studioUrl = settings?.studio_api_url || ''
  if (studioUrl && !/^https?:\/\//i.test(studioUrl)) {
    studioUrl = `https://${studioUrl}`
  }
  const studioApiKey = settings?.studio_api_key
  if (!studioUrl || !studioApiKey) {
    return NextResponse.json({ ok: false, error: 'Studio integration not configured' }, { status: 400 })
  }

  // Fetch naskah with studio_handoff (sw_naskah fallback naskah)
  let naskahRows: any[] | null = null
  const { data: swRows } = await supabase
    .from('sw_naskah')
    .select('id, studio_handoff')
    .in('id', naskahIds)

  if (swRows && swRows.length > 0) {
    naskahRows = swRows
  } else {
    const { data: legacyRows } = await supabase
      .from('naskah')
      .select('id, studio_handoff')
      .in('id', naskahIds)
    naskahRows = legacyRows
  }

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

    const jobStatuses = new Map<string, { id: string; status: string; result_urls?: any[] }>(
      (studioData.jobs || []).map((j: any) => [j.id, j])
    )

    for (const n of naskahRows) {
      const handoff = n.studio_handoff as any
      if (!handoff?.studio_job_ids) continue

      const jobId = handoff.studio_job_ids[0]
      const studioJob = jobStatuses.get(jobId)
      if (!studioJob) continue

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
        const nextHandoff = { ...handoff, status: newStatus }
        const { error: swErr } = await supabase
          .from('sw_naskah')
          .update({ studio_handoff: nextHandoff })
          .eq('id', n.id)
        if (swErr) {
          await supabase
            .from('naskah')
            .update({ studio_handoff: nextHandoff })
            .eq('id', n.id)
        }
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
