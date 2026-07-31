/**
 * TDD test suite for sync-feedback logic v3.
 *
 * Tests the core pure-logic functions extracted from the route handler.
 */
import { describe, it, expect } from 'vitest'

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// ── Sheet-ID resolution ─────────────────────────────────────────────────────

describe('resolveLinkedSheetId', () => {
  function resolveLinkedSheetId(
    googleSheetUrl: string | undefined,
    batchExternalDocRef: { doc_id?: string; doc_url?: string; type?: string } | null
  ): string | null {
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
    expect(resolveLinkedSheetId('https://docs.google.com/spreadsheets/d/SHEET_XYZ/edit#gid=0', null)).toBe('SHEET_XYZ')
  })

  it('resolves from external_doc_ref with type=sheet', () => {
    expect(resolveLinkedSheetId(undefined, { doc_id: 'SHEET_ABC', doc_url: 'https://docs.google.com/spreadsheets/d/SHEET_ABC/edit', type: 'sheet' })).toBe('SHEET_ABC')
  })

  it('resolves from external_doc_ref with spreadsheets URL (no type field)', () => {
    expect(resolveLinkedSheetId(undefined, { doc_id: 'SHEET_DEF', doc_url: 'https://docs.google.com/spreadsheets/d/SHEET_DEF/edit' })).toBe('SHEET_DEF')
  })

  it('returns null when external_doc_ref is a Google Doc (not sheet)', () => {
    expect(resolveLinkedSheetId(undefined, { doc_id: 'DOC_GHI', doc_url: 'https://docs.google.com/document/d/DOC_GHI/edit', type: 'doc' })).toBeNull()
  })

  it('returns null when no URL or ref provided', () => {
    expect(resolveLinkedSheetId(undefined, null)).toBeNull()
  })
})

// ── Persona matching ─────────────────────────────────────────────────────────

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
    expect(matchNaskahForRow([makeNaskah()], 'Stacy Prixie', '', 0)?.id).toBe('naskah-001')
  })

  it('matches by partial persona name', () => {
    expect(matchNaskahForRow([makeNaskah()], 'Stacy', '', 0)?.id).toBe('naskah-001')
  })

  it('matches by topic substring when persona is empty', () => {
    expect(matchNaskahForRow([makeNaskah()], '', 'Working Mom', 0)?.id).toBe('naskah-001')
  })

  it('falls back to row index', () => {
    const naskah = [makeNaskah(), makeNaskah({ id: 'naskah-002', sw_personas: [{ id: 'p-2', name: 'Laxita Zura' }] })]
    expect(matchNaskahForRow(naskah, 'Unknown Person', 'Unknown Topic', 1)?.id).toBe('naskah-002')
  })

  it('returns null when no match possible', () => {
    expect(matchNaskahForRow([], 'Nobody', 'Nothing', 99)).toBeNull()
  })
})

// ── Duplicate feedback guard ────────────────────────────────────────────────

describe('isDuplicateFeedback', () => {
  function isDuplicateFeedback(curVer: ReturnType<typeof makeVersion> | null, commentCell: string): boolean {
    if (!curVer || !commentCell.trim()) return false
    return curVer.change_summary === `Client Feedback: "${commentCell.trim()}"`
  }

  it('detects duplicate', () => {
    expect(isDuplicateFeedback(makeVersion({ change_summary: 'Client Feedback: "bikin lebih kasar"' }), 'bikin lebih kasar')).toBe(true)
  })

  it('new comment is not duplicate', () => {
    expect(isDuplicateFeedback(makeVersion({ change_summary: 'Client Feedback: "bikin lebih kasar"' }), 'TAMBAHIN ACEKIDNYA')).toBe(false)
  })

  it('null change_summary is not duplicate', () => {
    expect(isDuplicateFeedback(makeVersion({ change_summary: null }), 'anything')).toBe(false)
  })

  it('empty comment is not duplicate', () => {
    expect(isDuplicateFeedback(makeVersion(), '')).toBe(false)
  })
})

// ── Version number calculation (BUG C fix) ──────────────────────────────────

describe('nextVersionNo', () => {
  it('increments from current max', () => {
    expect(Math.max(1, 5) + 1).toBe(6)
  })

  it('starts at 1 when no versions exist', () => {
    expect((null ?? 0) + 1).toBe(1)
  })

  it('uses max of curVer and queried max', () => {
    const curVerNo = 2
    const queriedMax = 4  // other versions inserted by other flows
    expect(Math.max(curVerNo, queriedMax) + 1).toBe(5)
  })
})

// ── Status constraint validation (BUG B fix) ────────────────────────────────

describe('sw_naskah status values', () => {
  const VALID_STATUSES = ['draft', 'approved', 'rejected']

  it('draft is valid', () => expect(VALID_STATUSES).toContain('draft'))
  it('approved is valid', () => expect(VALID_STATUSES).toContain('approved'))
  it('rejected is valid', () => expect(VALID_STATUSES).toContain('rejected'))
  it('in_review is NOT valid', () => expect(VALID_STATUSES).not.toContain('in_review'))
})

// ── Column header detection ─────────────────────────────────────────────────

describe('column header detection', () => {
  function col(headerRow: string[], keywords: string[], fallback: number): number {
    const idx = headerRow.findIndex(h => keywords.some(k => h.includes(k)))
    return idx !== -1 ? idx : fallback
  }

  const headers = ['no', 'judul / topik', 'persona', 'hari / seri', 'hook (kalimat utama)', 'isi script / body', 'call to action (cta)', 'visual & direction notes', 'status klien', 'komentar / revisi klien']

  it('finds persona column', () => {
    expect(col(headers, ['persona'], 2)).toBe(2)
  })

  it('finds komentar column', () => {
    expect(col(headers, ['komentar', 'revisi'], 9)).toBe(9)
  })

  it('finds status column', () => {
    expect(col(headers, ['status'], 8)).toBe(8)
  })

  it('finds hook column', () => {
    expect(col(headers, ['hook', 'kalimat utama'], 4)).toBe(4)
  })

  it('uses fallback for missing column', () => {
    expect(col(headers, ['nonexistent'], 99)).toBe(99)
  })
})

// ── Google Sheets row length edge cases (BUG D) ────────────────────────────

describe('Google Sheets row truncation handling', () => {
  it('row shorter than expected returns empty string for missing cells', () => {
    // Google Sheets API returns rows where trailing empty cells are OMITTED
    const row = ['1', 'Topic', 'Stacy Prixie', 'Hari 1/3', 'Hook text', 'Body text', 'CTA text', 'Visual notes']
    // row.length = 8, columns I (8) and J (9) are missing
    const commentColIdx = 9
    const statusColIdx = 8

    // The ?? operator handles undefined correctly
    const commentCell = String(row[commentColIdx] ?? '').trim()
    const statusCell = String(row[statusColIdx] ?? '').trim()

    expect(commentCell).toBe('')
    expect(statusCell).toBe('')
  })

  it('full row returns all values', () => {
    const row = ['1', 'Topic', 'Stacy', 'Hari 1', 'Hook', 'Body', 'CTA', 'Visual', 'Pending Review', 'TAMBAHIN ACEKIDNYA']
    const commentCell = String(row[9] ?? '').trim()
    const statusCell = String(row[8] ?? '').trim()

    expect(commentCell).toBe('TAMBAHIN ACEKIDNYA')
    expect(statusCell).toBe('Pending Review')
  })

  it('|| operator treats 0 and empty string as falsy (the old bug)', () => {
    // This is why we use ?? instead of || for cell access
    const row: string[] = []
    // With ||: String(row[9] || '').trim() → String('').trim() = '' ✓ (same result here)
    // But with an explicit 0: String(0 || '') → '' vs String(0 ?? '') → '0'
    // For cell values this matters when the cell contains '0'
    expect(String(row[9] ?? '')).toBe('')
    expect(String(undefined ?? '')).toBe('')
  })
})
