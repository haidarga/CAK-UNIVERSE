import { describe, it, expect } from 'vitest'
import { formatNaskahForSheetsExport, parseClientFeedbackDelta } from '../src/lib/sheets-helpers'

describe('Google Sheets Export & Feedback Sync Helper', () => {
  it('formats naskah list for Google Sheets export correctly', () => {
    const rawNaskah = [{
      id: 'naskah_123',
      title: 'PURE NUTRITION · Stacy Prixie · Hari 1/3',
      persona_name: 'Stacy Prixie',
      body: [
        { type: 'hook', text: 'Ternyata ga semua susu anak sama' },
        { type: 'body', text: 'Kandungan nutrisinya lengkap banget' },
        { type: 'cta', text: 'Cek keranjang kuning sekarang!' },
      ]
    }]

    const exported = formatNaskahForSheetsExport(rawNaskah)
    expect(exported.length).toBe(1)
    expect(exported[0].persona).toBe('Stacy Prixie')
    expect(exported[0].day_series).toBe('Hari 1/3')
    expect(exported[0].hook_text).toBe('Ternyata ga semua susu anak sama')
    expect(exported[0].cta_text).toBe('Cek keranjang kuning sekarang!')
  })

  it('detects direct cell edit feedback from client', () => {
    const delta = parseClientFeedbackDelta({
      naskah_id: 'naskah_123',
      current_text: 'Susu ini murah',
      updated_cell_text: 'Susu ini terjangkau dan tinggi kalsium',
    })

    expect(delta.should_update).toBe(true)
    expect(delta.revised_text).toBe('Susu ini terjangkau dan tinggi kalsium')
    expect(delta.version_tag).toBe('v_revised_client')
  })

  it('detects client comments feedback', () => {
    const delta = parseClientFeedbackDelta({
      naskah_id: 'naskah_123',
      current_text: 'Susu ini enak',
      client_comment: 'Tolong tambahin kata DSA (Dokter Spesialis Anak)',
    })

    expect(delta.should_update).toBe(true)
    expect(delta.revision_notes).toContain('Client comment: "Tolong tambahin kata DSA')
  })
})
