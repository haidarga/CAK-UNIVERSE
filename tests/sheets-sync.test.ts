import { describe, it, expect } from 'vitest'
import { formatNaskahForSheetsExport, parseClientFeedbackDelta } from '../src/lib/sheets-helpers'

describe('Google Sheets Export & Feedback Sync Helper', () => {
  it('formats naskah list for Google Sheets export correctly with dynamic shot blocks', () => {
    const rawNaskah = [{
      id: 'naskah_123',
      title: 'Why Susu Segar? · Emma Hasibuan',
      persona_name: 'Emma Hasibuan',
      body: [
        { block_id: 'b1', section_key: 'hook', shot_no: 1, line_no: 1, speaker: 'Emma Hasibuan', text: 'Bingung kenapa susu formula kok ga cocok sama anak kamu?', visual_note: 'Emma ekspresi bingung' },
        { block_id: 'b2', section_key: 'body', shot_no: 2, line_no: 3, speaker: 'Emma Hasibuan', text: 'Bunda, perhatiin deh! Banyak banget jenis susu di pasaran.', visual_note: 'Emma talking head' },
        { block_id: 'b3', section_key: 'body', shot_no: 3, line_no: 4, speaker: 'Emma Hasibuan', text: 'Fakta ilmiahnya, susu segar itu sumber nutrisi paling alami.', visual_note: 'Emma green screen' },
        { block_id: 'b4', section_key: 'cta', shot_no: 5, line_no: 8, speaker: 'Emma Hasibuan', text: 'Jadi, kalau mau yang terbaik buat anak, cek lagi deh susunya.', visual_note: 'Emma menunjuk keranjang' },
      ]
    }]

    const exported = formatNaskahForSheetsExport(rawNaskah)
    expect(exported.length).toBe(1)
    expect(exported[0].persona).toBe('Emma Hasibuan')
    expect(exported[0].hook_text).toContain('[Shot 1] Emma Hasibuan: Bingung kenapa susu formula kok ga cocok sama anak kamu?')
    expect(exported[0].body_text).toContain('[Shot 2] Emma Hasibuan: Bunda, perhatiin deh! Banyak banget jenis susu di pasaran.')
    expect(exported[0].body_text).toContain('[Shot 3] Emma Hasibuan: Fakta ilmiahnya, susu segar itu sumber nutrisi paling alami.')
    expect(exported[0].cta_text).toContain('[Shot 5] Emma Hasibuan: Jadi, kalau mau yang terbaik buat anak, cek lagi deh susunya.')
    expect(exported[0].visual_notes).toContain('[Shot 1] Emma ekspresi bingung')
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
})
