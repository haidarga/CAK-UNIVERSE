import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import type { Block } from '@/lib/cakgpt/schemas'

// Diff two versions by block_id (ARCHITECTURE.md §6): unchanged block_id with
// changed text = modified; block_id in `from` only = deleted; in `to` only = added.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const { data: naskah } = await supabase.from('sw_naskah').select('id').eq('id', id).eq('created_by', user.id).maybeSingle()
  if (!naskah) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })

  const url = new URL(req.url)
  const fromNo = parseInt(url.searchParams.get('from') || '', 10)
  const toNo = parseInt(url.searchParams.get('to') || '', 10)
  if (!Number.isFinite(fromNo) || !Number.isFinite(toNo)) {
    return NextResponse.json({ ok: false, error: 'from and to (version_no) query params are required' }, { status: 400 })
  }

  const { data: versions, error } = await supabase
    .from('sw_naskah_versions').select('id, version_no, body').eq('naskah_id', id).in('version_no', [fromNo, toNo])
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const fromVersion = versions?.find((v) => v.version_no === fromNo)
  const toVersion = versions?.find((v) => v.version_no === toNo)
  if (!fromVersion || !toVersion) return NextResponse.json({ ok: false, error: 'one or both versions not found' }, { status: 404 })

  const fromBlocks: Block[] = fromVersion.body
  const toBlocks: Block[] = toVersion.body
  const fromById = new Map(fromBlocks.map((b) => [b.block_id, b]))
  const toById = new Map(toBlocks.map((b) => [b.block_id, b]))

  type DiffRow = { block_id: string; status: 'added' | 'modified' | 'unchanged' | 'deleted'; block: Block; previous_text?: string }
  const diff: DiffRow[] = toBlocks.map((b) => {
    const prev = fromById.get(b.block_id)
    if (!prev) return { block_id: b.block_id, status: 'added', block: b }
    if (prev.text !== b.text) return { block_id: b.block_id, status: 'modified', block: b, previous_text: prev.text }
    return { block_id: b.block_id, status: 'unchanged', block: b }
  })
  for (const b of fromBlocks) {
    if (!toById.has(b.block_id)) diff.push({ block_id: b.block_id, status: 'deleted', block: b })
  }

  const { data: flags } = await supabase
    .from('sw_qc_flags').select('*').eq('naskah_version_id', toVersion.id)

  return NextResponse.json({ ok: true, from: fromNo, to: toNo, diff, flags: flags || [] })
}
