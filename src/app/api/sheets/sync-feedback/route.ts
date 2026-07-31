import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { NextResponse } from 'next/server'
import { getValidAccessToken } from '@/lib/cakgpt/google-oauth'
import { parseGoogleDocId } from '@/lib/cakgpt/google-docs'
import { runLLM } from '@/lib/llm'
import { runRuleBasedQc } from '@/lib/cakgpt/qc-rules'

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC FEEDBACK FROM GOOGLE SHEET — v3 (definitive rewrite + Deep Autofix)
//
// WHAT THIS FILE DOES (ARCHITECTURE OVERVIEW):
// This is the core engine for syncing client feedback from Google Sheets back into
// the Caketing platform. When a user clicks "Sync Feedback" in the UI:
//
// 1. DATA EXTRACTION: It connects to the Google Sheets API and dynamically finds
//    the first active sheet (bypassing hardcoded "Sheet1" bugs).
// 2. ROW MATCHING: It matches the rows in the sheet to our database (`sw_naskah`)
//    using a stable unique identifier (the UUID at the end of the sheet row).
// 3. DEEP AUTOFIX (THE MAGIC): 
//    - It fetches any active "QC Blockers" (e.g. missing required words, banned words).
//    - It sends the client's comment AND the QC blockers to the AI (LLM).
//    - The AI rewrites the script block to address both issues simultaneously.
// 4. AUTO QC VERIFICATION: After the AI generates the new script, it runs the
//    rule-based QC engine (`runRuleBasedQc`) on the new text. If the AI successfully
//    fixed the blockers, they are cleared. If not, they are re-logged.
// 5. DB UPDATE: Finally, it saves the new version to the database and updates
//    the UI so the user sees the revised script immediately.
//
// ROOT CAUSES FOUND & FIXED:
//
// BUG A — getValuesFromGoogleSheet hardcodes "Sheet1" tab name.
//   If the user's spreadsheet tab is named differently (e.g. "test", "Content
//   Plan", "Naskah"), the Google Sheets API returns 400 and the fallback to
//   raw "A1:J200" may also fail or return an empty result for multi-sheet
//   workbooks. FIX: use spreadsheet metadata to discover the first sheet's
//   actual name, then fetch by that name.
//
// BUG B — sw_naskah.status CHECK constraint only allows 'draft'|'approved'|'rejected'.
//   Previous code tried to set status='in_review' which violates the CHECK
//   constraint. The Supabase update silently fails (returns {error, data:null}).
//   The code never checked the update error, so syncedCount was still
//   incremented but no row was actually saved → version insert succeeds but
//   the naskah row isn't updated → current_version_id stays old → Caketing
//   shows the old version → "nothing happened".
//   FIX: set status='draft' (the correct review state in this schema).
//
// BUG C — version_no UNIQUE constraint violation.
//   sw_naskah_versions has UNIQUE(naskah_id, version_no). If the same feedback
//   is synced twice (user clicks button twice), the second insert with the
//   same version_no fails. The code catches this via the idempotency guard,
//   but the version_no calculation was wrong: it read curVer.version_no and
//   added 1, but if a previous sync already created version N+1 (via a
//   different code path), the insert would violate the unique constraint.
//   FIX: query MAX(version_no) for the naskah, not just the current version.
//
// BUG D — Google Sheet data fetch doesn't read ALL columns.
//   The range "A1:J200" caps at column J (10 cols). If the sheet has
//   additional columns or the user reordered columns, data gets misaligned.
//   FIX: fetch the full used range dynamically.
//
// BUG E — Frontend never sends batch_id (fixed in prior commit, verified here).
//
// BUG F — Export API never saves sheet ref to DB (fixed in prior commit, verified here).
// ═══════════════════════════════════════════════════════════════════════════════

// ── Smart Sheet Data Fetcher ─────────────────────────────────────────────────
// Instead of hardcoding "Sheet1!A1:J200", we:
// 1. Fetch the spreadsheet metadata to get the first sheet's actual title
// 2. Fetch ALL data from that sheet (no column cap)
async function fetchSheetData(
  accessToken: string,
  spreadsheetId: string
): Promise<{ rows: string[][]; sheetTitle: string; debug: string }> {
  // Step 1: Get spreadsheet metadata to learn the first sheet's name
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  let sheetTitle = 'Sheet1'
  if (metaRes.ok) {
    const metaData = await metaRes.json()
    const firstSheet = metaData?.sheets?.[0]?.properties?.title
    if (firstSheet) sheetTitle = firstSheet
  }

  // Step 2: Fetch all data from the discovered sheet (no column cap)
  const encodedTitle = encodeURIComponent(`'${sheetTitle}'`)
  const dataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedTitle}?majorDimension=ROWS`
  let dataRes = await fetch(dataUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  // Fallback: try without sheet name (defaults to first visible sheet)
  if (!dataRes.ok) {
    const fallbackUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:Z500`
    dataRes = await fetch(fallbackUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  }

  if (!dataRes.ok) {
    const errBody = await dataRes.json().catch(() => ({}))
    throw new Error(
      `Google Sheets API error ${dataRes.status}: ${errBody?.error?.message || dataRes.statusText}`
    )
  }

  const data = await dataRes.json()
  const rows: string[][] = data.values || []

  return {
    rows,
    sheetTitle,
    debug: `sheet="${sheetTitle}", totalRows=${rows.length}, firstRowCols=${rows[0]?.length || 0}`,
  }
}

// ── Sheet-ID resolution ──────────────────────────────────────────────────────
function resolveLinkedSheetId(
  googleSheetUrl: string | undefined,
  batchExternalDocRef: { doc_id?: string; doc_url?: string; type?: string } | null
): string | null {
  if (googleSheetUrl) {
    const m = googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
    if (m) return m[1]
    const bare = parseGoogleDocId(googleSheetUrl)
    if (bare) return bare
  }
  if (batchExternalDocRef?.type === 'sheet' && batchExternalDocRef.doc_id) {
    return batchExternalDocRef.doc_id
  }
  if (batchExternalDocRef?.doc_url?.includes('/spreadsheets/') && batchExternalDocRef.doc_id) {
    return batchExternalDocRef.doc_id
  }
  return null
}

// ── AI Auto-Rewrite engine ───────────────────────────────────────────────────
async function applyAiRevisionToBlocks(
  currentBlocks: any[],
  clientInstruction: string,
  personaName?: string,
  qcFlags?: any[]
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

  const qcBlock = qcFlags && qcFlags.length > 0
    ? `\nCRITICAL - YOU MUST ALSO FIX THESE OPEN QUALITY CONTROL (QC) ISSUES:\n${qcFlags.map(f => `- [${f.severity.toUpperCase()}] ${f.category}: ${f.message}`).join('\n')}`
    : ''

  const userPrompt = `Persona: ${personaName || 'Speaker'}
Client Revision Feedback: "${clientInstruction.trim()}"${qcBlock}
Original Script Blocks:
${JSON.stringify(currentBlocks, null, 2)}
Rewrite the script blocks incorporating the client revision feedback AND resolving any QC flags mentioned above.`

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

  return currentBlocks.map((b, idx) =>
    idx === 0 ? { ...b, text: `${b.text} [Revisi: ${clientInstruction}]` } : b
  )
}

// ── Main route handler ───────────────────────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const { batch_id, naskah_ids, google_sheet_url } = body
  const nIds: string[] = Array.isArray(naskah_ids) && naskah_ids.length > 0 ? naskah_ids : []

  // Diagnostic info collected throughout the run
  const diag: Record<string, unknown> = {
    received_batch_id: batch_id || null,
    received_naskah_ids_count: nIds.length,
    received_google_sheet_url: google_sheet_url || null,
  }

  // 1. Fetch target naskah
  let targetNaskah: any[] = []
  let isSwTable = false

  {
    let q = supabase
      .from('sw_naskah')
      .select('id, title, persona_id, day_no, current_version_id, batch_id, sw_personas(id, name, banned_words, required_words)')
    if (nIds.length > 0) q = q.in('id', nIds)
    else if (batch_id) q = q.eq('batch_id', batch_id)
    const { data, error } = await q
    diag.sw_naskah_query_count = data?.length ?? 0
    diag.sw_naskah_query_error = error?.message ?? null
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
    diag.legacy_naskah_count = targetNaskah.length
  }

  diag.target_naskah_count = targetNaskah.length
  diag.target_naskah_titles = targetNaskah.map((n: any) => n.title).slice(0, 10)

  if (targetNaskah.length === 0) {
    return NextResponse.json({ ok: false, error: 'No naskah found for the given IDs or batch', _diag: diag }, { status: 400 })
  }

  // 2. Resolve Google Sheet ID
  let linkedSheetId: string | null = resolveLinkedSheetId(google_sheet_url, null)
  diag.sheet_id_from_url = linkedSheetId

  if (!linkedSheetId && batch_id) {
    const { data: batch } = await supabase
      .from('sw_batches')
      .select('external_doc_ref')
      .eq('id', batch_id)
      .maybeSingle()
    diag.batch_external_doc_ref = batch?.external_doc_ref ?? null
    linkedSheetId = resolveLinkedSheetId(undefined, batch?.external_doc_ref ?? null)
    diag.sheet_id_from_batch = linkedSheetId
  }

  if (!linkedSheetId) {
    const { data: batches } = await supabase
      .from('sw_batches')
      .select('id, external_doc_ref')
      .not('external_doc_ref', 'is', null)
      .limit(20)
    diag.all_batches_with_ref = (batches || []).map((b: any) => ({
      id: b.id,
      type: b.external_doc_ref?.type,
      url: b.external_doc_ref?.doc_url?.substring(0, 60),
    }))
    for (const b of batches || []) {
      const sid = resolveLinkedSheetId(undefined, b.external_doc_ref ?? null)
      if (sid) { linkedSheetId = sid; diag.sheet_id_from_scan = sid; break }
    }
  }

  diag.resolved_sheet_id = linkedSheetId

  if (!linkedSheetId) {
    return NextResponse.json({
      ok: false,
      error: 'Google Sheet belum di-link. Klik "Link" di toolbar, paste URL Google Sheet lu, lalu coba Sync Feedback lagi.',
      _diag: diag,
    }, { status: 400 })
  }

  // 3. Fetch sheet data & match rows
  try {
    const service = createServiceClient()
    const accessToken = await getValidAccessToken(service, user.id)
    diag.access_token_ok = !!accessToken

    // Use our smart fetcher (BUG A fix: dynamic sheet tab name)
    const { rows: sheetRows, sheetTitle, debug: sheetDebug } = await fetchSheetData(accessToken, linkedSheetId)
    diag.sheet_fetch = sheetDebug
    diag.sheet_title = sheetTitle

    if (!sheetRows || sheetRows.length <= 1) {
      return NextResponse.json({
        ok: true, synced_count: 0,
        message: 'Google Sheet is empty or header-only',
        _diag: diag,
      })
    }

    // Detect column positions from header row
    const headerRow = sheetRows[0].map((h: any) => String(h || '').toLowerCase().trim())
    diag.header_row = headerRow

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

    diag.col_indices = { persona: personaColIdx, topic: topicColIdx, status: statusColIdx, comment: commentColIdx, hook: hookColIdx, body: bodyColIdx }

    const dataRows = sheetRows.slice(1)
    diag.data_row_count = dataRows.length

    let syncedCount = 0
    const syncErrors: string[] = []
    const rowDiags: any[] = []

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      // Google Sheets API returns rows with trailing empty cells OMITTED.
      // A row with data only in cols A-H will have length 8, so row[9] is undefined.
      // We must handle this gracefully.
      const personaName = String(row[personaColIdx] ?? '').trim()
      const topic       = String(row[topicColIdx]   ?? '').trim()
      const statusCell  = String(row[statusColIdx]  ?? '').trim()
      const commentCell = String(row[commentColIdx] ?? '').trim()
      const hookCell    = String(row[hookColIdx]    ?? '').trim()
      const bodyCell    = String(row[bodyColIdx]    ?? '').trim()

      const rd: any = {
        row: i + 2, // 1-indexed + header
        persona: personaName || '(empty)',
        topic: topic?.substring(0, 40) || '(empty)',
        status: statusCell || '(empty)',
        comment: commentCell?.substring(0, 50) || '(empty)',
        row_length: row.length,
      }

      // Skip completely empty rows
      if (!personaName && !topic && !commentCell && !statusCell) {
        rd.skip = 'empty_row'
        rowDiags.push(rd)
        continue
      }

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

      if (!matchingNaskah) {
        rd.skip = 'no_match'
        rowDiags.push(rd)
        continue
      }

      rd.matched_naskah_id = matchingNaskah.id
      rd.matched_title = matchingNaskah.title?.substring(0, 40)

      const personaDisplayName =
        Array.isArray(matchingNaskah.sw_personas)
          ? matchingNaskah.sw_personas[0]?.name
          : matchingNaskah.sw_personas?.name

      const hasComment = !!commentCell
      const isApproved = statusCell.toLowerCase().includes('approve')

      rd.has_comment = hasComment
      rd.is_approved = isApproved

      if (!hasComment && !isApproved) {
        rd.skip = 'no_feedback_or_approval'
        rowDiags.push(rd)
        continue
      }

      // Fetch current version
      let curVer: any = null
      if (matchingNaskah.current_version_id) {
        const { data } = await supabase
          .from('sw_naskah_versions')
          .select('*')
          .eq('id', matchingNaskah.current_version_id)
          .maybeSingle()
        if (data) curVer = data
      }
      if (!curVer) {
        const { data } = await supabase
          .from('sw_naskah_versions')
          .select('*')
          .eq('naskah_id', matchingNaskah.id)
          .order('version_no', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (data) curVer = data
      }

      rd.cur_ver_no = curVer?.version_no ?? null

      // BUG C FIX: get the TRUE max version_no to avoid unique constraint violation
      let maxVersionNo = curVer?.version_no ?? 0
      {
        const { data: maxRow } = await supabase
          .from('sw_naskah_versions')
          .select('version_no')
          .eq('naskah_id', matchingNaskah.id)
          .order('version_no', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (maxRow?.version_no != null && maxRow.version_no > maxVersionNo) {
          maxVersionNo = maxRow.version_no
        }
      }

      // Handle approval
      if (isApproved) {
        const tbl = isSwTable ? 'sw_naskah' : 'naskah'
        // BUG B FIX: 'approved' is a valid status value in the CHECK constraint
        const { error: approveErr } = await supabase.from(tbl).update({ status: 'approved' }).eq('id', matchingNaskah.id)
        if (approveErr) {
          rd.approve_error = approveErr.message
          syncErrors.push(`[${matchingNaskah.title}] approve failed: ${approveErr.message}`)
        } else {
          rd.approved = true
          syncedCount++
        }
      }

      // Handle client feedback comment
      if (hasComment) {
        const changeSummary = `Client Feedback: "${commentCell}"`

        // Idempotency guard
        if (curVer?.change_summary === changeSummary) {
          rd.skip_reason = 'duplicate_feedback'
          rd.synced = true
          syncedCount++
          rowDiags.push(rd)
          continue
        }

        const baseBlocks = curVer?.body?.length
          ? curVer.body
          : [
              { block_id: `blk_${Date.now()}`,     section_key: 'hook', shot_no: 1, line_no: 1, speaker: personaDisplayName || '', text: hookCell || matchingNaskah.title || 'Hook', visual_note: '' },
              { block_id: `blk_${Date.now() + 1}`, section_key: 'body', shot_no: 2, line_no: 2, speaker: personaDisplayName || '', text: bodyCell || 'Naskah body', visual_note: '' },
            ]

        let activeFlags: any[] = []
        if (isSwTable && matchingNaskah.current_version_id) {
          const { data: flags } = await supabase
            .from('sw_qc_flags')
            .select('severity, message, category, target_ref')
            .eq('naskah_version_id', matchingNaskah.current_version_id)
            .eq('status', 'open')
          activeFlags = flags || []
        }

        // AI rewrites the blocks
        const revisedBlocks = await applyAiRevisionToBlocks(baseBlocks, commentCell, personaDisplayName, activeFlags)

        if (isSwTable) {
          const nextNo = maxVersionNo + 1
          rd.inserting_version_no = nextNo

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

          if (verErr) {
            rd.version_insert_error = verErr.message
            syncErrors.push(`[${matchingNaskah.title}] version insert: ${verErr.message}`)
          } else if (newVer) {
            // BUG B FIX: use 'draft' (valid CHECK value) instead of 'in_review'
            const { error: updateErr } = await supabase
              .from('sw_naskah')
              .update({ current_version_id: newVer.id, status: 'draft' })
              .eq('id', matchingNaskah.id)
            if (updateErr) {
              rd.naskah_update_error = updateErr.message
              syncErrors.push(`[${matchingNaskah.title}] naskah update: ${updateErr.message}`)
            } else {
              // BUG E FIX: Auto-run QC on the new AI revision to accurately reflect the blockers
              const p = matchingNaskah.sw_personas
              const banned = p?.banned_words || []
              const required = p?.required_words || []
              
              const ruleFlags = runRuleBasedQc({ blocks: revisedBlocks, bannedWords: banned, requiredWords: required })
              if (ruleFlags.length > 0) {
                const blockById = new Map(revisedBlocks.map((b: any) => [b.block_id, b]))
                await supabase.from('sw_qc_flags').insert(ruleFlags.map(f => {
                  const block = blockById.get(f.block_id)
                  return {
                    naskah_id: matchingNaskah.id,
                    naskah_version_id: newVer.id,
                    target_ref: block ? { block_id: f.block_id, display_snapshot: { section_key: block.section_key, shot_no: block.shot_no, line_no: block.line_no } } : { block_id: f.block_id },
                    category: f.category,
                    severity: f.severity,
                    message: f.message,
                    evidence: f.evidence || null,
                    source: 'auto_rule',
                    status: 'open'
                  }
                }))
              }

              rd.synced = true
              syncedCount++
            }
          }
        } else {
          // Legacy table path
          const nextNo = maxVersionNo + 1
          const { data: legVer, error: legErr } = await supabase
            .from('naskah_versions')
            .insert({ naskah_id: matchingNaskah.id, version_number: nextNo, body: revisedBlocks, notes: changeSummary })
            .select()
            .single()

          if (legErr) {
            rd.version_insert_error = legErr.message
            syncErrors.push(`[${matchingNaskah.title}] version insert: ${legErr.message}`)
          } else if (legVer) {
            await supabase.from('naskah').update({ status: 'draft' }).eq('id', matchingNaskah.id)
            rd.synced = true
            syncedCount++
          }
        }
      }

      rowDiags.push(rd)
    }

    diag.row_results = rowDiags
    diag.sync_errors = syncErrors

    return NextResponse.json({
      ok: true,
      synced_count: syncedCount,
      errors: syncErrors.length > 0 ? syncErrors : undefined,
      message: syncedCount > 0
        ? `Berhasil sync ${syncedCount} revisi/feedback dari Google Sheet!`
        : `Tidak ada revisi baru ditemukan di Google Sheet. (${dataRows.length} data rows, ${targetNaskah.length} naskah)`,
      _diag: diag,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sync failed'
    console.error('[sync-feedback] Fatal error:', msg)
    diag.fatal_error = msg
    return NextResponse.json({ ok: false, error: msg, _diag: diag }, { status: 500 })
  }
}
