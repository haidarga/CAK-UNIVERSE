// POST /api/studio/push — push approved naskah to CAK Video Studio.
// Compatible with both sw_ (cakai-ecosystem) and standard schemas.

import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { blocksToStudioShots, blocksToRawText } from '@/lib/studio-mapper'
import { NextResponse } from 'next/server'

const MAX_PUSH_PER_REQUEST = 100

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  // Parse body
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { naskah_ids } = body
  if (!Array.isArray(naskah_ids) || naskah_ids.length === 0) {
    return NextResponse.json({ ok: false, error: 'naskah_ids is required' }, { status: 400 })
  }
  if (naskah_ids.length > MAX_PUSH_PER_REQUEST) {
    return NextResponse.json({ ok: false, error: `Max ${MAX_PUSH_PER_REQUEST} naskah per push` }, { status: 400 })
  }

  // Get Studio integration settings (try sw_user_settings first, then user_settings)
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
    return NextResponse.json({
      ok: false,
      error: 'Video Studio integration not configured. Go to Settings → Video Studio Integration.'
    }, { status: 400 })
  }

  // Fetch naskah (try sw_naskah first, fallback to naskah)
  let naskahRows: any[] | null = null

  const { data: swNaskah } = await supabase
    .from('sw_naskah')
    .select(`
      id, title, status, batch_id, brief_id, persona_id, studio_handoff,
      current_version_id,
      sw_personas!inner(id, name)
    `)
    .in('id', naskah_ids)

  if (swNaskah && swNaskah.length > 0) {
    naskahRows = swNaskah.map(n => ({
      ...n,
      personas: n.sw_personas,
    }))
  } else {
    const { data: legacyNaskah } = await supabase
      .from('naskah')
      .select(`
        id, title, status, batch_id, brief_id, persona_id, studio_handoff,
        current_version_id,
        personas!inner(id, name)
      `)
      .in('id', naskah_ids)
    naskahRows = legacyNaskah
  }

  if (!naskahRows || naskahRows.length === 0) {
    return NextResponse.json({ ok: false, error: 'Failed to fetch naskah items' }, { status: 404 })
  }

  // If any pushed naskah are still in draft, auto-approve them on push
  const draftIdsToApprove = naskahRows.filter(n => n.status !== 'approved').map(n => n.id)
  if (draftIdsToApprove.length > 0) {
    await supabase.from('sw_naskah').update({ status: 'approved' }).in('id', draftIdsToApprove)
    await supabase.from('naskah').update({ status: 'approved' }).in('id', draftIdsToApprove)
  }
  const approvedNaskah = naskahRows

  // Fetch current version bodies (try sw_naskah_versions first, fallback to naskah_versions)
  const versionIds = approvedNaskah.map(n => n.current_version_id).filter(Boolean)
  let versions: any[] | null = null

  if (versionIds.length > 0) {
    const { data: swVersions } = await supabase
      .from('sw_naskah_versions')
      .select('id, naskah_id, body, format_meta')
      .in('id', versionIds)
    if (swVersions && swVersions.length > 0) {
      versions = swVersions
    } else {
      const { data: legacyVersions } = await supabase
        .from('naskah_versions')
        .select('id, naskah_id, body, format_meta')
        .in('id', versionIds)
      versions = legacyVersions
    }
  }

  const versionByNaskah = new Map(
    (versions || []).map(v => [v.naskah_id, v])
  )

  // Fetch saved persona mappings for fallback
  const { data: savedMappings } = await supabase
    .from('persona_studio_mappings')
    .select('caketing_persona_id, studio_persona_id, studio_persona_name')
    .eq('created_by', user.id)

  const mappingByPersona = new Map(
    (savedMappings || []).map(m => [m.caketing_persona_id, m])
  )

  // Fetch brief context (try sw_strategist_briefs first, fallback to strategist_briefs)
  const briefIds = [...new Set(approvedNaskah.map(n => n.brief_id).filter(Boolean))]
  let briefs: any[] | null = null
  if (briefIds.length > 0) {
    const { data: swBriefs } = await supabase
      .from('sw_strategist_briefs')
      .select('id, title, product, platform, fields')
      .in('id', briefIds)
    briefs = swBriefs
    if (!briefs || briefs.length === 0) {
      const { data: legacyBriefs } = await supabase
        .from('strategist_briefs')
        .select('id, title, product, platform, fields')
        .in('id', briefIds)
      briefs = legacyBriefs
    }
  }

  const briefById = new Map((briefs || []).map(b => [b.id, b]))

  // Fetch batch info for brand context
  const batchIds = [...new Set(approvedNaskah.map(n => n.batch_id).filter(Boolean))]
  let batches: any[] | null = null
  if (batchIds.length > 0) {
    const { data: swBatches } = await supabase
      .from('sw_batches')
      .select('id, name, client_id')
      .in('id', batchIds)
    batches = swBatches
    if (!batches || batches.length === 0) {
      const { data: legacyBatches } = await supabase
        .from('batches')
        .select('id, name, client_id')
        .in('id', batchIds)
      batches = legacyBatches
    }
  }

  const batchById = new Map((batches || []).map(b => [b.id, b]))

  // Fetch client (brand) names
  const clientIds = [...new Set((batches || []).map(b => b.client_id).filter(Boolean))]
  let clients: any[] | null = null
  if (clientIds.length > 0) {
    const { data: swClients } = await supabase
      .from('sw_clients')
      .select('id, name')
      .in('id', clientIds)
    clients = swClients
    if (!clients || clients.length === 0) {
      const { data: legacyClients } = await supabase
        .from('clients')
        .select('id, name')
        .in('id', clientIds)
      clients = legacyClients
    }
  }

  const clientById = new Map((clients || []).map(c => [c.id, c]))

  // Build ingest payload
  const ingestItems = []
  const errors: Array<{ naskah_id: string; error: string }> = []

  for (const n of approvedNaskah) {
    const version = versionByNaskah.get(n.id)
    if (!version?.body) {
      errors.push({ naskah_id: n.id, error: 'No version body found' })
      continue
    }

    // We group by Caketing batch_id so that 1 Caketing generation = 1 Studio Inbox card.
    // If n.batch_id is missing, fallback to brief_id or 'general'.
    const bInfo = {
      id: n.batch_id || n.brief_id || 'batch_general',
      title: n.batch_id ? batchById.get(n.batch_id)?.name || 'Content Plan' : 'General Batch'
    }

    const blocks = version.body
    const persona = n.personas as { id: string; name: string }
    const brief = briefById.get(n.brief_id)
    const batch = n.batch_id ? batchById.get(n.batch_id) : null
    const client = batch?.client_id ? clientById.get(batch.client_id) : null

    // Resolve persona mapping
    const savedMapping = persona?.id ? mappingByPersona.get(persona.id) : null

    const personaMapping = {
      source_persona_id: persona?.id || null,
      persona_name: persona?.name || 'Subject',
      ...(savedMapping ? {
        studio_persona_id: savedMapping.studio_persona_id,
        studio_persona_name: savedMapping.studio_persona_name,
      } : {}),
    }

    // Convert blocks → shots
    const parsedShots = blocksToStudioShots(blocks)
    const rawText = blocksToRawText(blocks)
    const formatMeta = version.format_meta || {}

    ingestItems.push({
      source: 'caketing',
      source_ref: {
        naskah_id: n.id,
        batch_id: n.batch_id,
        persona_id: persona?.id,
        brief_id: n.brief_id,
        day_no: n.day_no,
        day_match: dayMatch,
        push_batch_id: bInfo.id,
        push_batch_title: bInfo.title,
      },
      title: n.title || 'Untitled',
      naskah_text: rawText,
      parsed_shots: parsedShots,
      persona_mapping: personaMapping,
      brand_name: client?.name || '',
      brief_context: brief?.fields || {},
      format_meta: {
        platform: brief?.platform || formatMeta.platform || 'tiktok',
        target_duration_s: formatMeta.target_duration_s || 30,
        aspect_ratio: formatMeta.aspect_ratio || '9:16',
      },
    })
  }

  if (ingestItems.length === 0) {
    return NextResponse.json({
      ok: false,
      error: 'No naskah to push',
      errors,
    }, { status: 400 })
  }

  // POST to Video Studio
  let studioResponse: any
  try {
    const res = await fetch(`${studioUrl.replace(/\/$/, '')}/api/external/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studioApiKey}`,
      },
      body: JSON.stringify({ naskah: ingestItems }),
    })

    studioResponse = await res.json()

    if (!res.ok || !studioResponse.ok) {
      return NextResponse.json({
        ok: false,
        error: `Video Studio rejected the push: ${studioResponse.error || res.statusText}`,
      }, { status: 502 })
    }
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: `Failed to reach Video Studio: ${e instanceof Error ? e.message : String(e)}`,
    }, { status: 502 })
  }

  // Update naskah.studio_handoff with returned job IDs
  const studioJobs = studioResponse.jobs || []
  const jobIdsByNaskah = new Map<string, string>()

  for (let i = 0; i < ingestItems.length; i++) {
    const sourceRef = ingestItems[i].source_ref
    const studioJob = studioJobs[i]
    if (sourceRef?.naskah_id && studioJob?.studio_job_id) {
      jobIdsByNaskah.set(sourceRef.naskah_id, studioJob.studio_job_id)
    }
  }

  // Write handoff data back (try sw_naskah first, then naskah)
  for (const [naskahId, studioJobId] of jobIdsByNaskah) {
    const handoffData = {
      studio_job_ids: [studioJobId],
      pushed_at: new Date().toISOString(),
      status: 'pushed',
    }

    const { error: swErr } = await supabase
      .from('sw_naskah')
      .update({ studio_handoff: handoffData })
      .eq('id', naskahId)

    if (swErr) {
      await supabase
        .from('naskah')
        .update({ studio_handoff: handoffData })
        .eq('id', naskahId)
    }
  }

  return NextResponse.json({
    ok: true,
    pushed: studioJobs.length,
    jobs: studioJobs,
    errors: errors.length > 0 ? errors : undefined,
  })
}
