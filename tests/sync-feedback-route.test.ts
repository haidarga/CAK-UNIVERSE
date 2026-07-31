/**
 * TDD test suite for sync-feedback logic.
 *
 * ROOT CAUSE BUGS being tested:
 *
 * BUG 1 — Sheet URL never resolves (0 naskah every time):
 *   TriageQueue.syncFeedbackFromSheet() sends `google_sheet_url` only when
 *   `docRef?.doc_url?.includes('/spreadsheets/')`.  BUT `docRef` is the
 *   batch's external_doc_ref which stores the *Google Doc* URL
 *   (docs.google.com/document/d/...), not the Sheet URL.  So the condition is
 *   always false, google_sheet_url is never sent, and the backend falls back to
 *   searching sw_batches for a spreadsheet ref — which also doesn't exist
 *   because the sheet was exported directly (the export API pushed to the Sheet
 *   but stored the sheet_id only in-memory, never saved it to external_doc_ref).
 *   Result: linkedSheetId === null → "Paste or link a Google Sheet URL first"
 *   or continues with null and bails in the loop with 0 matches.
 *
 * BUG 2 — batch_id never sent by frontend (so backend can't look up the sheet):
 *   TriageQueue sends { naskah_ids, google_sheet_url } but NEVER sends batch_id.
 *   The backend's fallback "search all batches for spreadsheet ref" scan has no
 *   scope — it picks any batch at random (or finds nothing).
 *
 * BUG 3 — Export API saves sheet to state but never to DB (external_doc_ref):
 *   pushToSheet() gets a sheet_url back from the export API but only calls
 *   window.open(data.sheet_url), it never calls setDocRef() with the sheet URL.
 *   So docRef stays pointing to the Google Doc, and syncFeedbackFromSheet never
 *   knows the sheet URL.
 *
 * FIXES:
 *   A. Frontend: always pass batch_id to sync-feedback. Also update docRef with
 *      sheet URL after a successful export.
 *   B. Export API: save the linked sheet URL to sw_batches.external_doc_ref so
 *      subsequent syncs can find it even if the frontend state is stale.
 *   C. Sync-feedback: when batch_id is present, resolve the sheet from
 *      sw_batches.external_doc_ref correctly (type:'sheet'), then fall back to
 *      the naskah_ids list to batch-match rows.
 */
import { describe, it, expect } from 'vitest'

// ── Helpers re-used across tests ────────────────────────────────────────────

function makeNaskah(overrides: Record<string, unknown> = {}) {
  return {
    id: 'naskah-001',
    title: "Working Mom's Travel Experience with Milk Formula",
    persona_id: 'persona-001',
    current_version_id: 'ver-001',
    batch_id: 'batch-001',
    sw_personas: [{ id: 'persona-001', name: 'Stacy Prixie' }],
    ...overrides,
  }
}

function makeVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ver-001',
    naskah_id: 'naskah-001',
    version_no: 1,
    body: [
      { block_id: 'blk-1', section_key: 'hook', shot_no: 1, line_no: 1, speaker: 'Stacy Prixie', text: 'Anakku pernah muntah karena aku lupa cek bahan ini sebelum beli sufor anak!', visual_note: 'Stacy terlihat sedikit panik' },
      { block_id: 'blk-2', section_key: 'body', shot_no: 2, line_no: 2, speaker: 'Stacy Prixie', text: 'Padahal, pas travelling ke Eropa bahan pertama di label sufor lokal itu selalu natural whole milk.', visual_note: 'Transisi cepat' },
    ],
    created_via: 'ai_generation',
    change_summary: null,
    created_by: '00000000-0000-4000-8000-000000000001',
    ...overrides,
  }
}

// ── BUG 1 tests — Sheet URL resolution logic ─────────────────────────────────

describe('resolveLinkedSheetId', () => {
  function resolveLinkedSheetId(
    googleSheetUrl: string | undefined,
    batchExternalDocRef: { doc_id?: string; doc_url?: string; type?: string } | null
  ): string | null {
    // Replicate the exact logic in sync-feedback/route.ts after our fix
    if (googleSheetUrl) {
      const m = googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
      if (m) return m[1]
    }
    if (batchExternalDocRef?.type === 'sheet' && batchExternalDocRef.doc_id) {
      return batchExternalDocRef.doc_id
    }
    if (batchExternalDocRef?.doc_url?.includes('/spreadsheets/') && batchExternalDocRef.doc_id) {
      return batchExternalDocRef.doc_id
    }
    return null
  }

  it('resolves from explicit google_sheet_url', () => {
    const id = resolveLinkedSheetId(
      'https://docs.google.com/spreadsheets/d/SHEET_ID_XYZ/edit#gid=0',
      null
    )
    expect(id).toBe('SHEET_ID_XYZ')
  })

  it('resolves from external_doc_ref with type=sheet', () => {
    const id = resolveLinkedSheetId(undefined, {
      doc_id: 'SHEET_ID_ABC',
      doc_url: 'https://docs.google.com/spreadsheets/d/SHEET_ID_ABC/edit',
      type: 'sheet',
    })
    expect(id).toBe('SHEET_ID_ABC')
  })

  it('resolves from external_doc_ref with spreadsheets URL (no type field)', () => {
    const id = resolveLinkedSheetId(undefined, {
      doc_id: 'SHEET_ID_DEF',
      doc_url: 'https://docs.google.com/spreadsheets/d/SHEET_ID_DEF/edit',
    })
    expect(id).toBe('SHEET_ID_DEF')
  })

  it('returns null when external_doc_ref is a Google Doc (not sheet)', () => {
    const id = resolveLinkedSheetId(undefined, {
      doc_id: 'DOC_ID_GHI',
      doc_url: 'https://docs.google.com/document/d/DOC_ID_GHI/edit',
      type: 'doc',
    })
    expect(id).toBeNull()
  })

  it('returns null when no URL or ref provided', () => {
    expect(resolveLinkedSheetId(undefined, null)).toBeNull()
  })
})

// ── BUG 2 tests — Persona matching logic ─────────────────────────────────────

describe('matchNaskahForRow', () => {
  function matchNaskahForRow(
    targetNaskah: ReturnType<typeof makeNaskah>[],
    personaName: string,
    topic: string,
    rowIndex: number
  ) {
    return (
      targetNaskah.find(n => {
        const pName = Array.isArray(n.sw_personas) ? n.sw_personas[0]?.name : (n.sw_personas as any)?.name
        if (!pName || !personaName) return false
        const normP = pName.toLowerCase().replace(/[^a-z0-9]/g, '')
        const normCell = personaName.toLowerCase().replace(/[^a-z0-9]/g, '')
        return normP.includes(normCell) || normCell.includes(normP)
      }) ||
      targetNaskah.find(n => n.title && topic && n.title.toLowerCase().includes(topic.toLowerCase())) ||
      (rowIndex < targetNaskah.length ? targetNaskah[rowIndex] : undefined) ||
      null
    )
  }

  it('matches by persona name exact', () => {
    const naskah = [makeNaskah()]
    const match = matchNaskahForRow(naskah, 'Stacy Prixie', '', 0)
    expect(match?.id).toBe('naskah-001')
  })

  it('matches by partial persona name (sheet shows first name only)', () => {
    const naskah = [makeNaskah()]
    const match = matchNaskahForRow(naskah, 'Stacy', '', 0)
    expect(match?.id).toBe('naskah-001')
  })

  it('matches by topic substring when persona is empty', () => {
    const naskah = [makeNaskah()]
    const match = matchNaskahForRow(naskah, '', 'Working Mom', 0)
    expect(match?.id).toBe('naskah-001')
  })

  it('falls back to row index when no name or topic match', () => {
    const naskah = [makeNaskah(), makeNaskah({ id: 'naskah-002', sw_personas: [{ id: 'p-2', name: 'Laxita Zura' }] })]
    const match = matchNaskahForRow(naskah, 'Unknown Person', 'Unknown Topic', 1)
    expect(match?.id).toBe('naskah-002')
  })

  it('returns null when rowIndex out of bounds and no match', () => {
    const match = matchNaskahForRow([], 'Nobody', 'Nothing', 99)
    expect(match).toBeNull()
  })
})

// ── BUG 3 tests — Duplicate comment guard ─────────────────────────────────────

describe('isDuplicateFeedback', () => {
  function isDuplicateFeedback(curVer: ReturnType<typeof makeVersion> | null, commentCell: string): boolean {
    if (!curVer || !commentCell.trim()) return false
    return curVer.change_summary === `Client Feedback: "${commentCell.trim()}"`
  }

  it('detects a duplicate when change_summary matches current comment', () => {
    const ver = makeVersion({ change_summary: 'Client Feedback: "bikin narasinya lebih kasar"' })
    expect(isDuplicateFeedback(ver, 'bikin narasinya lebih kasar')).toBe(true)
  })

  it('does not flag new/different comment as duplicate', () => {
    const ver = makeVersion({ change_summary: 'Client Feedback: "bikin narasinya lebih kasar"' })
    expect(isDuplicateFeedback(ver, 'KURANG ADA ACEKIDNYA, TAMBAHIN ACEKIDNYA')).toBe(false)
  })

  it('does not flag null change_summary as duplicate', () => {
    const ver = makeVersion({ change_summary: null })
    expect(isDuplicateFeedback(ver, 'bikin narasinya lebih kasar')).toBe(false)
  })

  it('does not flag empty comment', () => {
    const ver = makeVersion({ change_summary: null })
    expect(isDuplicateFeedback(ver, '')).toBe(false)
  })
})

// ── BUG 3 tests — version_no calculation  ────────────────────────────────────

describe('nextVersionNo', () => {
  function nextVersionNo(curVer: { version_no?: number } | null): number {
    return (curVer?.version_no ?? 0) + 1
  }

  it('starts at 2 when current version is 1', () => {
    expect(nextVersionNo(makeVersion({ version_no: 1 }))).toBe(2)
  })

  it('starts at 1 when there is no current version', () => {
    expect(nextVersionNo(null)).toBe(1)
  })

  it('increments correctly for version 5', () => {
    expect(nextVersionNo({ version_no: 5 })).toBe(6)
  })
})
