import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { NextResponse } from 'next/server'
import { parseClientFeedbackDelta } from '@/lib/sheets-helpers'

export async function POST(req: Request) {
  const supabase = await createServerClient()

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { naskah_id, current_text, updated_cell_text, client_comment, client_status } = body
  if (!naskah_id) {
    return NextResponse.json({ ok: false, error: 'naskah_id is required' }, { status: 400 })
  }

  const delta = parseClientFeedbackDelta({
    naskah_id,
    current_text: current_text || '',
    updated_cell_text,
    client_comment,
  })

  if (!delta.should_update) {
    return NextResponse.json({ ok: true, updated: false, message: delta.reason })
  }

  // Fetch current version to build revised blocks
  const { data: ver } = await supabase
    .from('sw_naskah_versions')
    .select('*')
    .eq('naskah_id', naskah_id)
    .eq('is_current', true)
    .maybeSingle()

  const currentBody = ver?.body || [
    { type: 'hook', text: delta.revised_text },
  ]

  const updatedBody = Array.isArray(currentBody)
    ? currentBody.map(b => b.type === 'hook' ? { ...b, text: delta.revised_text } : b)
    : currentBody

  // Unmark previous current version
  await supabase
    .from('sw_naskah_versions')
    .update({ is_current: false })
    .eq('naskah_id', naskah_id)

  // Insert revised version
  const { data: newVer, error: verErr } = await supabase
    .from('sw_naskah_versions')
    .insert({
      naskah_id,
      version_number: (ver?.version_number || 1) + 1,
      is_current: true,
      body: updatedBody,
      notes: delta.revision_notes,
      created_by: null,
    })
    .select()
    .single()

  if (verErr) {
    return NextResponse.json({ ok: false, error: verErr.message }, { status: 500 })
  }

  // Update naskah status
  const naskahStatus = client_status === 'Approved' ? 'approved' : 'in_review'
  await supabase.from('sw_naskah').update({ status: naskahStatus }).eq('id', naskah_id)
  await supabase.from('naskah').update({ status: naskahStatus }).eq('id', naskah_id)

  return NextResponse.json({
    ok: true,
    updated: true,
    naskah_id,
    version_id: newVer?.id,
    revision_notes: delta.revision_notes,
    status: naskahStatus,
  })
}
