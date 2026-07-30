export function formatNaskahForSheetsExport(naskahList: any[]) {
  return naskahList.map((n, idx) => {
    const blocks: any[] = Array.isArray(n.body) ? n.body : []

    const hookParts: string[] = []
    const bodyParts: string[] = []
    const ctaParts: string[] = []
    const visualParts: string[] = []

    blocks.forEach((b, blockIdx) => {
      const text = (b.text || '').trim()
      const speaker = (b.speaker || '').trim()
      const shotLabel = `[Shot ${b.shot_no || blockIdx + 1}]`
      const lineText = speaker ? `${shotLabel} ${speaker}: ${text}` : `${shotLabel} ${text}`
      const key = (b.section_key || b.type || '').toLowerCase()

      if (key.includes('hook') || (blockIdx === 0 && !key.includes('body') && !key.includes('cta'))) {
        if (text) hookParts.push(lineText.trim())
      } else if (key.includes('cta') || (blockIdx === blocks.length - 1 && blocks.length > 2 && key.includes('cta'))) {
        if (text) ctaParts.push(lineText.trim())
      } else {
        if (text) bodyParts.push(lineText.trim())
      }

      if (b.visual_note?.trim()) {
        visualParts.push(`${shotLabel} ${b.visual_note.trim()}`)
      }
    })

    const hookText = hookParts.join('\n\n')
    const bodyText = bodyParts.join('\n\n')
    const ctaText = ctaParts.join('\n\n')
    const visualText = visualParts.join('\n\n')

    return {
      no: idx + 1,
      naskah_id: n.id,
      topic: n.topic || n.title?.split('·')[0]?.trim() || 'Content Plan',
      persona: n.persona_name || 'Subject',
      day_series: n.day_series || n.title?.match(/Hari \d+(?:\/\d+)?/i)?.[0] || (n.day_no ? `Hari ${n.day_no}` : 'Hari 1/3'),
      hook_text: hookText || n.title || '-',
      body_text: bodyText || '-',
      cta_text: ctaText || '-',
      visual_notes: visualText || '-',
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
