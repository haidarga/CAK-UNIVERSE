import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { generateNaskah } from '@/lib/cakgpt/generation'

export const runtime = 'nodejs'
export const maxDuration = 300

const CHUNK = 12 // jobs claimed + run per call. With thinking disabled each
// Gemini call is ~5-8s (down from ~30s), so 12 parallel calls fit easily
// within maxDuration=300. The pump loop drains the batch fast.
const MAX_ATTEMPTS = 3 // a job that keeps failing gives up after this many tries

// POST /api/gen-jobs/process — claim up to CHUNK pending jobs for a batch and
// run them. Called in a loop by the client after enqueue; each call is short and
// returns how many jobs remain so the client knows whether to keep pumping. Safe
// to call concurrently — claim_gen_jobs uses FOR UPDATE SKIP LOCKED.
export async function POST(req: Request) {
  const authClient = await createServerClient()
  const { user, unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const batchId = String(body.batch_id || '')
  if (!batchId) return NextResponse.json({ ok: false, error: 'batch_id required' }, { status: 400 })

  const { data: batch } = await authClient.from('sw_batches').select('id').eq('id', batchId).eq('created_by', user.id).maybeSingle()
  if (!batch) return NextResponse.json({ ok: false, error: 'batch not found' }, { status: 404 })

  const service = createServiceClient()
  const { data: claimed, error: claimErr } = await service.rpc('sw_claim_gen_jobs', {
    p_batch_id: batchId, p_created_by: user.id, p_limit: CHUNK,
  })
  if (claimErr) return NextResponse.json({ ok: false, error: claimErr.message }, { status: 500 })

  // sw_claim_gen_jobs `returns setof sw_gen_jobs` (returning g.*), so columns
  // added to the table — day_no/day_total here — flow through with no RPC change.
  const jobs = (claimed || []) as Array<{
    id: string; brief_id: string; persona_id: string | null; extra_context: string | null; content_format: string | null; pakem_id: string | null; output_type: string | null; general: boolean | null
    day_no: number | null; day_total: number | null; attempts: number
  }>
  let done = 0
  let failed = 0

  await Promise.all(jobs.map(async (job) => {
    try {
      const res = await generateNaskah({
        supabase: service,
        createdBy: user.id,
        briefId: job.brief_id,
        batchId,
        personaIdOverride: job.persona_id || undefined,
        extraContext: job.extra_context || undefined,
        contentFormat: job.content_format,
        pakemId: job.pakem_id,
        outputType: job.output_type,
        general: !!job.general,
        dayNo: job.day_no ?? undefined,
        dayTotal: job.day_total ?? undefined,
        skipCritic: true, // bulk fast-path: rule-QC now, full critic on demand via /qc/rerun
      })
      if (res.ok) {
        await service.from('sw_gen_jobs').update({ status: 'done', naskah_id: res.naskahId, error: null }).eq('id', job.id)
        done++
      } else {
        // Requeue for another attempt unless we've exhausted retries.
        const giveUp = job.attempts >= MAX_ATTEMPTS
        await service.from('sw_gen_jobs').update({ status: giveUp ? 'failed' : 'pending', error: res.error }).eq('id', job.id)
        if (giveUp) failed++
      }
    } catch (e) {
      const giveUp = job.attempts >= MAX_ATTEMPTS
      await service.from('sw_gen_jobs').update({ status: giveUp ? 'failed' : 'pending', error: e instanceof Error ? e.message : 'job threw' }).eq('id', job.id)
      if (giveUp) failed++
    }
  }))

  // Anything still pending OR running (claimed by another in-flight pump) means
  // the client should keep going.
  const { count: remaining } = await service
    .from('sw_gen_jobs').select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId).in('status', ['pending', 'running'])

  return NextResponse.json({ ok: true, claimed: jobs.length, done, failed, remaining: remaining ?? 0 })
}
