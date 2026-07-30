import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { NextResponse } from 'next/server'
import { parseClientFeedbackDelta } from '@/lib/sheets-helpers'
import { getValidAccessToken } from '@/lib/cakgpt/google-oauth'
import { getValuesFromGoogleSheet } from '@/lib/cakgpt/google-sheets'
import { parseGoogleDocId } from '@/lib/cakgpt/google-docs'

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { batch_id, naskah_ids, google_sheet_url, naskah_id, current_text, updated_cell_text, client_comment, client_status } = body

  // Single naskah feedback update
  if (naskah_id) {
    const delta = parseClientFeedbackDelta({
      naskah_id,
      current_text: current_text || '',
      updated_cell_text,
      client_comment,
    })

    if (!delta.should_update) {
      return NextResponse.json({ ok: true, updated: false, message: delta.reason })
    }

    const { data: ver } = await supabase
      .from('sw_naskah_versions')
      .select('*')
      .eq('naskah_id', naskah_id)
      .eq('is_current', true)
      .maybeSingle()

    const currentBody = ver?.body || [{ type: 'hook', text: delta.revised_text }]
    const updatedBody = Array.isArray(currentBody)
      ? currentBody.map(b => b.type === 'hook' || b.section_key === 'hook' ? { ...b, text: delta.revised_text } : b)
      : currentBody

    await supabase.from('sw_naskah_versions').update({ is_current: false }).eq('naskah_id', naskah_id)
    const { data: newVer, error: verErr } = await supabase
      .from('sw_naskah_versions')
      .insert({
        naskah_id,
        version_number: (ver?.version_number || 1) + 1,
        is_current: true,
        body: updatedBody,
        notes: delta.revision_notes,
      })
      .select().single()

    if (verErr) return NextResponse.json({ ok: false, error: verErr.message }, { status: 500 })

    const naskahStatus = client_status === 'Approved' ? 'approved' : 'in_review'
    await supabase.from('sw_naskah').update({ status: naskahStatus, current_version_id: newVer.id }).eq('id', naskah_id)

    return NextResponse.json({ ok: true, updated: true, naskah_id, version_id: newVer?.id })
  }

  // Target naskah list for batch sync
  let targetNaskah: any[] = []
  if (Array.isArray(naskah_ids) && naskah_ids.length > 0) {
    const { data: nList } = await supabase.from('sw_naskah').select('id, title, persona_id, day_no, current_version_id, sw_personas(id, name)').in('id', naskah_ids)
    if (nList) targetNaskah = nList
  } else if (batch_id) {
    const { data: bList } = await supabase.from('sw_naskah').select('id, title, persona_id, day_no, current_version_id, sw_personas(id, name)').eq('batch_id', batch_id)
    if (bList) targetNaskah = bList
  }

  if (targetNaskah.length === 0) {
    return NextResponse.json({ ok: false, error: 'Target naskah list is empty' }, { status: 400 })
  }

  // Google Sheet ID lookup
  let linkedSheetId: string | null = null
  if (batch_id) {
    const { data: batch } = await supabase.from('sw_batches').select('external_doc_ref').eq('id', batch_id).maybeSingle()
    if (batch?.external_doc_ref?.doc_id && batch.external_doc_ref.doc_url?.includes('/spreadsheets/')) {
      linkedSheetId = batch.external_doc_ref.doc_id
    }
  }

  if (google_sheet_url) {
    const parsedId = parseGoogleDocId(google_sheet_url)
    if (parsedId) linkedSheetId = parsedId
  }

  if (!linkedSheetId) {
    return NextResponse.json({ ok: false, error: 'No Google Sheet linked to this batch' }, { status: 400 })
  }

  try {
    const service = createServiceClient()
    const accessToken = await getValidAccessToken(service, user.id)
    const sheetRows = await getValuesFromGoogleSheet(accessToken, linkedSheetId)

    if (!sheetRows || sheetRows.length <= 1) {
      return NextResponse.json({ ok: true, synced_count: 0, message: 'Google Sheet is empty or header-only' })
    }

    // Skip header row
    const dataRows = sheetRows.slice(1)
    let syncedCount = 0

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const topic = (row[1] || '').trim()
      const personaName = (row[2] || '').trim()
      const statusCell = (row[8] || '').trim()
      const commentCell = (row[9] || '').trim()

      // Match target naskah by persona name, topic, or row index
      const matchingNaskah = targetNaskah.find(n => {
        const pName = Array.isArray(n.sw_personas) ? n.sw_personas[0]?.name : n.sw_personas?.name
        return pName && personaName && pName.toLowerCase() === personaName.toLowerCase()
      }) || targetNaskah[i]

      if (!matchingNaskah) continue

      const hasComment = !!commentCell.trim()
      const isApproved = statusCell.toLowerCase().includes('approve')

      if (isApproved) {
        await supabase.from('sw_naskah').update({ status: 'approved' }).eq('id', matchingNaskah.id)
        syncedCount++
      }

      if (hasComment) {
        // Create revision entry with client comment
        const { data: curVer } = await supabase.from('sw_naskah_versions').select('*').eq('id', matchingNaskah.current_version_id).maybeSingle()
        if (curVer) {
          await supabase.from('sw_naskah_versions').update({ is_current: false }).eq('naskah_id', matchingNaskah.id)
          const { data: newVer } = await supabase.from('sw_naskah_versions').insert({
            naskah_id: matchingNaskah.id,
            version_number: (curVer.version_number || 1) + 1,
            is_current: true,
            body: curVer.body,
            notes: `Client Feedback: "${commentCell.trim()}"`,
          }).select().single()

          if (newVer) {
            await supabase.from('sw_naskah').update({ current_version_id: newVer.id, status: 'in_review' }).eq('id', matchingNaskah.id)
            syncedCount++
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      synced_count: syncedCount,
      message: `Berhasil sync ${syncedCount} revisi/feedback dari Google Sheet!`,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Sync failed' }, { status: 500 })
  }
}
