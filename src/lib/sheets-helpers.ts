export function formatNaskahForSheetsExport(naskahList: any[]) {
  return naskahList.map((n, idx) => {
    const blocks: any[] = Array.isArray(n.body) ? n.body : []

    let hookBlocks = blocks.filter(b => (b.section_key || b.type || '').toLowerCase().includes('hook'))
    let ctaBlocks = blocks.filter(b => (b.section_key || b.type || '').toLowerCase().includes('cta'))
    let bodyBlocks = blocks.filter(b => !hookBlocks.includes(b) && !ctaBlocks.includes(b))

    // Fallbacks if section_key wasn't named 'hook' or 'cta'
    if (hookBlocks.length === 0 && blocks.length > 0) {
      hookBlocks = [blocks[0]]
      bodyBlocks = blocks.slice(1)
    }
    if (ctaBlocks.length === 0 && bodyBlocks.length > 1) {
      ctaBlocks = [bodyBlocks[bodyBlocks.length - 1]]
      bodyBlocks = bodyBlocks.slice(0, bodyBlocks.length - 1)
    }

    const hookText = hookBlocks.map(b => b.text || '').filter(Boolean).join('\n')
    const bodyText = bodyBlocks.map(b => b.text || '').filter(Boolean).join('\n')
    const ctaText = ctaBlocks.map(b => b.text || '').filter(Boolean).join('\n')
    const visualNotes = blocks.map(b => b.visual_note ? `[${b.section_key || 'shot'}] ${b.visual_note}` : '').filter(Boolean).join('\n')

    return {
      no: idx + 1,
      naskah_id: n.id,
      topic: n.topic || n.title?.split('·')[0]?.trim() || 'Content Plan',
      persona: n.persona_name || 'Subject',
      day_series: n.day_series || n.title?.match(/Hari \d+(?:\/\d+)?/i)?.[0] || (n.day_no ? `Hari ${n.day_no}` : 'Hari 1/3'),
      hook_text: hookText || n.title || '',
      body_text: bodyText || '',
      cta_text: ctaText || '',
      visual_notes: visualNotes || '-',
      client_status: n.client_status || 'Pending Review',
      client_comment: n.client_comment || '',
    }
  })
}

export function parseClientFeedbackDelta(payload: {
  naskah_id: string
  current_text: string
  updated_cell_text?: string
  client_comment?: string
}) {
  const isDirectEdit = !!payload.updated_cell_text && payload.updated_cell_text !== payload.current_text
  const hasComment = !!payload.client_comment?.trim()

  if (!isDirectEdit && !hasComment) {
    return { should_update: false, reason: 'No changes or feedback detected' }
  }

  const newText = isDirectEdit ? payload.updated_cell_text : payload.current_text
  const revisionNotes = [
    isDirectEdit ? `Direct edit from client: "${payload.updated_cell_text}"` : null,
    hasComment ? `Client comment: "${payload.client_comment}"` : null,
  ].filter(Boolean).join(' | ')

  return {
    should_update: true,
    naskah_id: payload.naskah_id,
    revised_text: newText,
    revision_notes: revisionNotes,
    version_tag: 'v_revised_client',
  }
}
