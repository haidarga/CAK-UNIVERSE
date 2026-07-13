import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'

// GET /api/batches/[id]/gen-status — job counts for a batch, so the triage UI can
// show generation progress and resume pumping if there are still pending jobs
// (e.g. after a page reload mid-run).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: batchId } = await params
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const { data, error } = await supabase
    .from('sw_gen_jobs').select('status').eq('batch_id', batchId).eq('created_by', user.id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const counts = { pending: 0, running: 0, done: 0, failed: 0 }
  for (const j of data || []) {
    if (j.status in counts) counts[j.status as keyof typeof counts]++
  }
  const total = (data || []).length
  return NextResponse.json({ ok: true, ...counts, total, active: counts.pending + counts.running })
}
