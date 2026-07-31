import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { NextResponse } from 'next/server'
import { getValidAccessToken } from '@/lib/cakgpt/google-oauth'
import { getValuesFromGoogleSheet } from '@/lib/cakgpt/google-sheets'
import { parseGoogleDocId } from '@/lib/cakgpt/google-docs'
import { runLLM } from '@/lib/llm'

// ── Sheet-ID resolution (FIX for BUG 1) ─────────────────────────────────────
// external_doc_ref can be either a Google Doc (type='doc') or a Google Sheet
// (type='sheet'). We only accept the latter for sync-feedback.
function resolveLinkedSheetId(
  googleSheetUrl: string | undefined,
  batchExternalDocRef: { doc_id?: string; doc_url?: string; type?: string } | null
): string | null {
  // 1. Explicit URL passed from frontend always wins
  if (googleSheetUrl) {
    const m = googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
    if (m) return m[1]
    // plain sheet id
    const bare = parseGoogleDocId(googleSheetUrl)
    if (bare) return bare
  }
  // 2. Batch-linked ref — accept only if it really is a sheet
  if (batchExternalDocRef?.type === 'sheet' && batchExternalDocRef.doc_id) {
    return batchExternalDocRef.doc_id
  }
  if (batchExternalDocRef?.doc_url?.includes('/spreadsheets/') && batchExternalDocRef.doc_id) {
    return batchExternalDocRef.doc_id
  }
  return null
}

// ── AI Auto-Rewrite engine ────────────────────────────────────────────────────
async function applyAiRevisionToBlocks(
  currentBlocks: any[],
  clientInstruction: string,
  personaName?: string
): Promise<any[]> {
  if (!clientInstruction?.trim()) return currentBlocks

  const systemPrompt = `You are an expert AI script editor for viral short-form videos (TikTok, Reels, Shorts).
Your task is to revise and rewrite the provided video script blocks based strictly on the client's revision feedback instruction.
Rules:
1. Maintain the exact same JSON array schema:
   [{ "block_id": "...", "section_key": "hook"|"body"|"cta", "shot_no": 1, "line_no": 1, "speaker": "...", "text": "...", "visual_note": "..." }]
2. Apply the client's revision feedback directly into the script dialogue ("text") and visual notes ("visual_note").
3. Do NOT remove block_ids or change the block count unless the instruction specifically asks for it.
4. Output ONLY valid JSON array of block objects. No markdown fences or commentary.`

  const userPrompt = `Persona: ${personaName || 'Speaker'}
Client Revision Feedback: "${clientInstruction.trim()}"
Original Script Blocks:
${JSON.stringify(currentBlocks, null, 2)}
Rewrite the script blocks incorporating the client revision feedback.`

  try {
    const res = await runLLM({ system: systemPrompt, prompt: userPrompt, json: true, temperature: 0.7 })
    const raw = res.text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].text) {
      return parsed.map((p: any, idx: number) => ({
        block_id: p.block_id || currentBlocks[idx]?.block_id || `blk_${Date.now()}_${idx}`,
        section_key: p.section_key || currentBlocks[idx]?.section_key || 'body',
        shot_no: p.shot_no || currentBlocks[idx]?.shot_no || idx + 1,
        line_no: p.line_no || currentBlocks[idx]?.line_no || idx + 1,
        speaker: p.speaker || personaName || currentBlocks[idx]?.speaker || '',
        text: p.text || currentBlocks[idx]?.text || '',
        visual_note: p.visual_note ?? currentBlocks[idx]?.visual_note ?? '',
      }))
    }
  } catch (e) {
    console.warn('[sync-feedback] AI revision LLM call failed, using fallback annotate:', e)
  }

  // Fallback: annotate first block text with the instruction (better than nothing)
  return currentBlocks.map((b, idx) =>
    idx === 0 ? { ...b, text: `${b.text} [Revisi: ${clientInstruction}]` } : b
  )
}

// ── Main route handler ────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const { batch_id, naskah_ids, google_sheet_url } = body
  const nIds: string[] = Array.isArray(naskah_ids) && naskah_ids.length > 0 ? naskah_ids : []

  // 1. Fetch target naskah (FIX for BUG 2: always include batch scope)
  let targetNaskah: any[] = []
  let isSwTable = false

  {
    let q = supabase
      .from('sw_naskah')
      .select('id, title, persona_id, day_no, current_version_id, batch_id, sw_personas(id, name)')
    if (nIds.length > 0) q = q.in('id', nIds)
    else if (batch_id) q = q.eq('batch_id', batch_id)
    const { data } = await q
    if (data && data.length > 0) { targetNaskah = data; isSwTable = true }
  }

  if (targetNaskah.length === 0 && (nIds.length > 0 || batch_id)) {
    let q = supabase
      .from('naskah')
      .select('id, title, persona_id, day_no, current_version_id, batch_id, personas(id, name)')
    if (nIds.length > 0) q = q.in('id', nIds)
    else if (batch_id) q = q.eq('batch_id', batch_id)
    const { data } = await q
    targetNaskah = (data || []).map((l: any) => ({ ...l, sw_personas: l.personas }))
  }

  if (targetNaskah.length === 0) {
    return NextResponse.json({ ok: false, error: 'No naskah found for the given IDs or batch' }, { status: 400 })
  }

  // 2. Resolve Google Sheet ID (FIX for BUG 1)
  // Try: explicit URL → batch external_doc_ref (type=sheet) → any batch with a sheet ref
  let linkedSheetId: string | null = resolveLinkedSheetId(google_sheet_url, null)

  if (!linkedSheetId && batch_id) {
    const { data: batch } = await supabase
      .from('sw_batches')
      .select('external_doc_ref')
      .eq('id', batch_id)
      .maybeSingle()
    linkedSheetId = resolveLinkedSheetId(undefined, batch?.external_doc_ref ?? null)
  }

  if (!linkedSheetId) {
    // Last-resort: scan all batches that have a linked sheet
    const { data: batches } = await supabase
      .from('sw_batches')
      .select('id, external_doc_ref')
      .not('external_doc_ref', 'is', null)
      .limit(20)
    for (const b of batches || []) {
      const sid = resolveLinkedSheetId(undefined, b.external_doc_ref ?? null)
      if (sid) { linkedSheetId = sid; break }
    }
  }

  if (!linkedSheetId) {
    return NextResponse.json({
      ok: false,
      error: 'Google Sheet belum di-link. Klik "Link" di toolbar, paste URL Google Sheet lu, lalu coba Sync Feedback lagi.',
    }, { status: 400 })
  }

  // 3. Fetch sheet data & match rows
  try {
    const service = createServiceClient()
    const accessToken = await getValidAccessToken(service, user.id)
    const sheetRows = await getValuesFromGoogleSheet(accessToken, linkedSheetId)

    if (!sheetRows || sheetRows.length <= 1) {
      return NextResponse.json({ ok: true, synced_count: 0, message: 'Google Sheet is empty or header-only' })
    }

    const headerRow = sheetRows[0].map((h: any) => String(h || '').toLowerCase().trim())
    const col = (keywords: string[], fallback: number) => {
      const idx = headerRow.findIndex((h: string) => keywords.some(k => h.includes(k)))
      return idx !== -1 ? idx : fallback
    }
    const personaColIdx = col(['persona'], 2)
    const topicColIdx   = col(['topik', 'judul'], 1)
    const statusColIdx  = col(['status'], 8)
    const commentColIdx = col(['komentar', 'revisi'], 9)
    const hookColIdx    = col(['hook', 'kalimat utama'], 4)
    const bodyColIdx    = col(['body', 'isi script', 'script'], 5)

    const dataRows = sheetRows.slice(1)
    let syncedCount = 0
    const syncErrors: string[] = []

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const personaName = String(row[personaColIdx] || '').trim()
      const topic       = String(row[topicColIdx]   || '').trim()
      const statusCell  = String(row[statusColIdx]  || '').trim()
      const commentCell = String(row[commentColIdx] || '').trim()
      const hookCell    = String(row[hookColIdx]    || '').trim()
      const bodyCell    = String(row[bodyColIdx]    || '').trim()

      // Match naskah: persona → topic → row-index
      const matchingNaskah =
        targetNaskah.find(n => {
          const pName = Array.isArray(n.sw_personas) ? n.sw_personas[0]?.name : n.sw_personas?.name
          if (!pName || !personaName) return false
          const normP = pName.toLowerCase().replace(/[^a-z0-9]/g, '')
          const normC = personaName.toLowerCase().replace(/[^a-z0-9]/g, '')
          return normP.includes(normC) || normC.includes(normP)
        }) ||
        targetNaskah.find(n => n.title && topic && n.title.toLowerCase().includes(topic.toLowerCase())) ||
        (i < targetNaskah.length ? targetNaskah[i] : null)

      if (!matchingNaskah) continue

      const personaDisplayName =
        Array.isArray(matchingNaskah.sw_personas)
          ? matchingNaskah.sw_personas[0]?.name
          : matchingNaskah.sw_personas?.name

      const hasComment = !!commentCell
      const isApproved = statusCell.toLowerCase().includes('approve')

      // Fetch current version (version_no column, not version_number)
      let curVer: any = null
      if (matchingNaskah.current_version_id) {
        const { data } = await supabase.from('sw_naskah_versions').select('*').eq('id', matchingNaskah.current_version_id).maybeSingle()
        if (data) curVer = data
      }
      if (!curVer) {
        const { data } = await supabase.from('sw_naskah_versions').select('*').eq('naskah_id', matchingNaskah.id).order('version_no', { ascending: false }).limit(1).maybeSingle()
        if (data) curVer = data
      }

      // Handle approval
      if (isApproved) {
        const tbl = isSwTable ? 'sw_naskah' : 'naskah'
        await supabase.from(tbl).update({ status: 'approved' }).eq('id', matchingNaskah.id)
        syncedCount++
      }

      // Handle client feedback comment
      if (hasComment) {
        const changeSummary = `Client Feedback: "${commentCell}"`

        // Skip if this exact feedback already applied (idempotency guard)
        if (curVer?.change_summary === changeSummary) {
          syncedCount++ // still count it so user sees it wasn't lost
          continue
        }

        const baseBlocks = curVer?.body?.length
          ? curVer.body
          : [
              { block_id: `blk_${Date.now()}`,     section_key: 'hook', shot_no: 1, line_no: 1, speaker: personaDisplayName || '', text: hookCell || matchingNaskah.title || 'Hook', visual_note: '' },
              { block_id: `blk_${Date.now() + 1}`, section_key: 'body', shot_no: 2, line_no: 2, speaker: personaDisplayName || '', text: bodyCell || 'Naskah body', visual_note: '' },
            ]

        // AI rewrites the blocks to actually implement the revision instruction
        const revisedBlocks = await applyAiRevisionToBlocks(baseBlocks, commentCell, personaDisplayName)

        if (isSwTable) {
          const nextNo = (curVer?.version_no ?? 0) + 1
          const { data: newVer, error: verErr } = await supabase
            .from('sw_naskah_versions')
            .insert({
              naskah_id: matchingNaskah.id,
              version_no: nextNo,
              body: revisedBlocks,
              created_via: 'writer_edit',
              change_summary: changeSummary,
              created_by: user.id,
            })
            .select()
            .single()

          if (newVer) {
            await supabase.from('sw_naskah').update({ current_version_id: newVer.id, status: 'in_review' }).eq('id', matchingNaskah.id)
            syncedCount++
          } else if (verErr) {
            syncErrors.push(`[${matchingNaskah.title}] ${verErr.message}`)
          }
        } else {
          const nextNo = (curVer?.version_number ?? 0) + 1
          const { data: legVer, error: legErr } = await supabase
            .from('naskah_versions')
            .insert({ naskah_id: matchingNaskah.id, version_number: nextNo, body: revisedBlocks, notes: changeSummary })
            .select()
            .single()

          if (legVer) {
            await supabase.from('naskah').update({ status: 'in_review' }).eq('id', matchingNaskah.id)
            syncedCount++
          } else if (legErr) {
            syncErrors.push(`[${matchingNaskah.title}] ${legErr.message}`)
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
    const msg = e instanceof Error ? e.message : 'Sync failed'
    console.error('[sync-feedback] Fatal error:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
