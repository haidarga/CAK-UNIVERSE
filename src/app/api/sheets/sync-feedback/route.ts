import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { NextResponse } from 'next/server'
import { getValidAccessToken } from '@/lib/cakgpt/google-oauth'
import { getValuesFromGoogleSheet } from '@/lib/cakgpt/google-sheets'
import { parseGoogleDocId } from '@/lib/cakgpt/google-docs'
import { runLLM } from '@/lib/llm'

// AI Helper to rewrite script blocks according to client feedback/revision requests
async function applyAiRevisionToBlocks(
  currentBlocks: any[],
  clientInstruction: string,
  personaName?: string
): Promise<any[]> {
  if (!clientInstruction?.trim()) return currentBlocks

  const systemPrompt = `You are an expert AI script editor for viral short-form videos (TikTok, Reels, Shorts).
Your task is to revise and rewrite the provided video script blocks based strictly on the client's revision feedback instruction.
Rules:
1. Maintain the exact same JSON array schema of blocks:
   [{ "block_id": "...", "section_key": "hook"|"body"|"cta", "shot_no": 1, "line_no": 1, "speaker": "...", "text": "...", "visual_note": "..." }]
2. Apply the client's revision feedback directly into the script dialogue ("text") and visual notes ("visual_note").
3. Do NOT remove block_ids or change the number of blocks unless requested.
4. Output ONLY valid JSON array of block objects. No markdown fences or commentary.`

  const userPrompt = `Persona: ${personaName || 'Speaker'}
Client Revision Feedback Instruction:
"${clientInstruction.trim()}"

Original Script Blocks:
${JSON.stringify(currentBlocks, null, 2)}

Rewrite the script blocks incorporating the client revision feedback.`

  try {
    const res = await runLLM({
      system: systemPrompt,
      prompt: userPrompt,
      json: true,
      temperature: 0.7,
    })

    const raw = res.text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '')
    const parsed = JSON.parse(raw)

    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].text) {
      return parsed.map((p, idx) => ({
        block_id: p.block_id || currentBlocks[idx]?.block_id || `blk_${Date.now()}_${idx}`,
        section_key: p.section_key || currentBlocks[idx]?.section_key || 'body',
        shot_no: p.shot_no || currentBlocks[idx]?.shot_no || idx + 1,
        line_no: p.line_no || currentBlocks[idx]?.line_no || idx + 1,
        speaker: p.speaker || personaName || currentBlocks[idx]?.speaker || '',
        text: p.text || currentBlocks[idx]?.text || '',
        visual_note: p.visual_note || currentBlocks[idx]?.visual_note || '',
      }))
    }
  } catch (e) {
    console.warn('AI script revision LLM call failed, falling back to direct block text update:', e)
  }

  // Fallback if LLM unavailable or fails: append client instruction to first and last block
  return currentBlocks.map((b, idx) => {
    if (idx === 0 || b.section_key === 'hook') {
      return { ...b, text: `${b.text} [Revisi: ${clientInstruction}]` }
    }
    return b
  })
}

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

  const { batch_id, naskah_ids, google_sheet_url } = body

  // 1. Fetch target naskah rows with personas & current versions
  let targetNaskah: any[] = []
  const nIds = Array.isArray(naskah_ids) && naskah_ids.length > 0 ? naskah_ids : []

  // Always fetch all naskah in batch or list to ensure full matching capability
  let query = supabase.from('sw_naskah').select('id, title, persona_id, day_no, current_version_id, batch_id, sw_personas(id, name)')
  if (nIds.length > 0) {
    query = query.in('id', nIds)
  } else if (batch_id) {
    query = query.eq('batch_id', batch_id)
  }

  const { data: swList } = await query
  let isSwTable = false

  if (swList && swList.length > 0) {
    targetNaskah = swList
    isSwTable = true
  } else {
    // Fallback legacy table
    let legQuery = supabase.from('naskah').select('id, title, persona_id, day_no, current_version_id, batch_id, personas(id, name)')
    if (nIds.length > 0) legQuery = legQuery.in('id', nIds)
    else if (batch_id) legQuery = legQuery.eq('batch_id', batch_id)
    const { data: legList } = await legQuery
    targetNaskah = (legList || []).map((l: any) => ({ ...l, sw_personas: l.personas }))
  }

  if (targetNaskah.length === 0) {
    return NextResponse.json({ ok: false, error: 'No naskah target found in queue' }, { status: 400 })
  }

  // 2. Resolve Google Sheet ID
  let linkedSheetId: string | null = null
  if (google_sheet_url) {
    linkedSheetId = parseGoogleDocId(google_sheet_url)
  }

  if (!linkedSheetId && batch_id) {
    const { data: batch } = await supabase.from('sw_batches').select('external_doc_ref').eq('id', batch_id).maybeSingle()
    if (batch?.external_doc_ref?.doc_id && batch.external_doc_ref.doc_url?.includes('/spreadsheets/')) {
      linkedSheetId = batch.external_doc_ref.doc_id
    }
  }

  if (!linkedSheetId) {
    // Search any linked sheet in batch
    const { data: anyBatch } = await supabase.from('sw_batches').select('external_doc_ref').not('external_doc_ref', 'is', null).limit(10)
    const matchRef = (anyBatch || []).find(b => b.external_doc_ref?.doc_url?.includes('/spreadsheets/'))
    if (matchRef?.external_doc_ref?.doc_id) {
      linkedSheetId = matchRef.external_doc_ref.doc_id
    }
  }

  if (!linkedSheetId) {
    return NextResponse.json({ ok: false, error: 'Paste or link a Google Sheet URL first' }, { status: 400 })
  }

  try {
    const service = createServiceClient()
    const accessToken = await getValidAccessToken(service, user.id)
    const sheetRows = await getValuesFromGoogleSheet(accessToken, linkedSheetId)

    if (!sheetRows || sheetRows.length <= 1) {
      return NextResponse.json({ ok: true, synced_count: 0, message: 'Google Sheet is empty or header-only' })
    }

    // Dynamic Header Column Index Matching
    const headerRow = sheetRows[0].map((h: any) => String(h || '').toLowerCase().trim())
    const personaColIdx = headerRow.findIndex((h: string) => h.includes('persona')) !== -1 ? headerRow.findIndex((h: string) => h.includes('persona')) : 2
    const topicColIdx = headerRow.findIndex((h: string) => h.includes('topik') || h.includes('judul')) !== -1 ? headerRow.findIndex((h: string) => h.includes('topik') || h.includes('judul')) : 1
    const statusColIdx = headerRow.findIndex((h: string) => h.includes('status')) !== -1 ? headerRow.findIndex((h: string) => h.includes('status')) : 8
    const commentColIdx = headerRow.findIndex((h: string) => h.includes('komentar') || h.includes('revisi')) !== -1 ? headerRow.findIndex((h: string) => h.includes('komentar') || h.includes('revisi')) : 9
    const hookColIdx = headerRow.findIndex((h: string) => h.includes('hook')) !== -1 ? headerRow.findIndex((h: string) => h.includes('hook')) : 4
    const bodyColIdx = headerRow.findIndex((h: string) => h.includes('body') || h.includes('script')) !== -1 ? headerRow.findIndex((h: string) => h.includes('body') || h.includes('script')) : 5

    const dataRows = sheetRows.slice(1)
    let syncedCount = 0
    const syncErrors: string[] = []

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const personaName = (row[personaColIdx] || '').trim()
      const topic = (row[topicColIdx] || '').trim()
      const statusCell = (row[statusColIdx] || '').trim()
      const commentCell = (row[commentColIdx] || '').trim()
      const hookCell = (row[hookColIdx] || '').trim()
      const bodyCell = (row[bodyColIdx] || '').trim()

      // Match target naskah by persona name (fuzzy), topic substring, or row index
      const matchingNaskah = targetNaskah.find(n => {
        const pName = Array.isArray(n.sw_personas) ? n.sw_personas[0]?.name : n.sw_personas?.name
        if (!pName || !personaName) return false
        const normP = pName.toLowerCase().replace(/[^a-z0-9]/g, '')
        const normCell = personaName.toLowerCase().replace(/[^a-z0-9]/g, '')
        return normP.includes(normCell) || normCell.includes(normP)
      }) || targetNaskah.find(n => n.title && topic && n.title.toLowerCase().includes(topic.toLowerCase())) || targetNaskah[i]

      if (!matchingNaskah) continue

      const personaDisplayName = Array.isArray(matchingNaskah.sw_personas) ? matchingNaskah.sw_personas[0]?.name : matchingNaskah.sw_personas?.name

      const hasComment = !!commentCell.trim()
      const isApproved = statusCell.toLowerCase().includes('approve')

      // Fetch current version
      let curVer: any = null
      if (matchingNaskah.current_version_id) {
        const { data: vById } = await supabase.from('sw_naskah_versions').select('*').eq('id', matchingNaskah.current_version_id).maybeSingle()
        if (vById) curVer = vById
      }
      if (!curVer) {
        const { data: vByNId } = await supabase.from('sw_naskah_versions').select('*').eq('naskah_id', matchingNaskah.id).order('version_no', { ascending: false }).limit(1).maybeSingle()
        if (vByNId) curVer = vByNId
      }
      if (!curVer) {
        const { data: legVer } = await supabase.from('naskah_versions').select('*').eq('naskah_id', matchingNaskah.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (legVer) curVer = legVer
      }

      if (isApproved) {
        if (isSwTable) {
          await supabase.from('sw_naskah').update({ status: 'approved' }).eq('id', matchingNaskah.id)
        } else {
          await supabase.from('naskah').update({ status: 'approved' }).eq('id', matchingNaskah.id)
        }
        syncedCount++
      }

      if (hasComment) {
        const changeSummaryNote = `Client Feedback: "${commentCell.trim()}"`

        // Check if this exact client feedback has already been synced to current version
        if (curVer?.change_summary === changeSummaryNote) {
          syncedCount++
          continue
        }

        const baseBlocks = curVer?.body || [
          { block_id: `blk_${Date.now()}`, section_key: 'hook', shot_no: 1, line_no: 1, text: hookCell || matchingNaskah.title, visual_note: '' },
          { block_id: `blk_${Date.now()+1}`, section_key: 'body', shot_no: 2, line_no: 2, text: bodyCell || 'Naskah body', visual_note: '' },
        ]

        // Execute AI Auto-Rewrite on blocks to implement client revision instruction directly into script text & visual notes!
        const revisedBlocks = await applyAiRevisionToBlocks(baseBlocks, commentCell, personaDisplayName)

        if (isSwTable) {
          const nextVersionNo = (curVer?.version_no || 1) + 1
          const { data: newVer, error: verErr } = await supabase.from('sw_naskah_versions').insert({
            naskah_id: matchingNaskah.id,
            version_no: nextVersionNo,
            body: revisedBlocks,
            created_via: 'writer_edit',
            change_summary: changeSummaryNote,
            created_by: user.id,
          }).select().single()

          if (newVer) {
            await supabase.from('sw_naskah').update({ current_version_id: newVer.id, status: 'in_review' }).eq('id', matchingNaskah.id)
            syncedCount++
          } else if (verErr) {
            syncErrors.push(`Failed version insert for ${matchingNaskah.title}: ${verErr.message}`)
          }
        } else {
          const { data: legVer, error: legErr } = await supabase.from('naskah_versions').insert({
            naskah_id: matchingNaskah.id,
            version_number: (curVer?.version_number || 1) + 1,
            body: revisedBlocks,
            notes: changeSummaryNote,
          }).select().single()

          if (legVer) {
            await supabase.from('naskah').update({ status: 'in_review' }).eq('id', matchingNaskah.id)
            syncedCount++
          } else if (legErr) {
            syncErrors.push(`Failed legacy version insert for ${matchingNaskah.title}: ${legErr.message}`)
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      synced_count: syncedCount,
      errors: syncErrors.length > 0 ? syncErrors : undefined,
      message: `Berhasil sync ${syncedCount} revisi/feedback dari Google Sheet!`,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Sync failed' }, { status: 500 })
  }
}
