export function formatNaskahForSheetsExport(naskahList: any[]) {
  return naskahList.map(n => ({
    naskah_id: n.id,
    topic: n.topic || n.title?.split('·')[0]?.trim() || 'Content Plan',
    persona: n.persona_name || 'Subject',
    day_series: n.day_series || n.title?.match(/Hari \d+(?:\/\d+)?/i)?.[0] || 'Hari 1/3',
    hook_text: n.hook || n.body?.find((b: any) => b.type === 'hook')?.text || '',
    body_text: n.body?.filter((b: any) => b.type !== 'hook' && b.type !== 'cta')?.map((b: any) => b.text).join('\n') || '',
    cta_text: n.cta || n.body?.find((b: any) => b.type === 'cta')?.text || '',
    client_status: n.client_status || 'Pending Review',
    client_comment: n.client_comment || '',
  }))
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
