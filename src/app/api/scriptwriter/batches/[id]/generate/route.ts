import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { GenerateBatchBodySchema } from '@/lib/cakgpt/schemas'

// Bulk fan-out is now ENQUEUE-ONLY: it inserts one gen_job per (brief × persona)
// and returns immediately. The client then pumps /api/gen-jobs/process in small
// chunks so naskah stream into the triage queue without one giant request that
// times out at scale (e.g. 71 briefs × 9 personas = 639 naskah). See
// 0006_gen_jobs.sql / ARCHITECTURE.md §10 #6.
//
// Decisions preserved here (validated at enqueue time, before any job runs):
//   #2 multi-persona fan-out — body is `items: [{brief_id, persona_id?}]`.
//   #4 one-client-per-batch — all briefs share one client; the batch adopts it
//      atomically via lock_batch_client.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: batchId } = await params
  const authClient = await createServerClient()
  const { user, unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  let json: unknown
  try { json = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const parsed = GenerateBatchBodySchema.safeParse(json)
  if (!parsed.success) {
    const n = Array.isArray((json as { items?: unknown[] })?.items) ? (json as { items: unknown[] }).items.length : 0
    const reason = n > 4000 ? `too many items (${n}) — max 4000 per run; split it` : 'items required: [{ brief_id, persona_id? }]'
    return NextResponse.json({ ok: false, error: reason }, { status: 400 })
  }
  const items = parsed.data.items

  const userId = user.id
  const { data: batch, error: batchLookupErr } = await authClient
    .from('sw_batches').select('id').eq('id', batchId).eq('created_by', userId).maybeSingle()
  if (batchLookupErr) return NextResponse.json({ ok: false, error: batchLookupErr.message }, { status: 500 })
  if (!batch) return NextResponse.json({ ok: false, error: 'batch not found' }, { status: 404 })

  // ── Client scoping (decision #4) ──────────────────────────────────────────
  const briefIds = [...new Set(items.map((i) => i.brief_id))]
  const { data: briefRows, error: briefErr } = await authClient
    .from('sw_strategist_briefs').select('id, client_id').eq('created_by', userId).in('id', briefIds)
  if (briefErr) return NextResponse.json({ ok: false, error: briefErr.message }, { status: 500 })

  const foundBriefIds = new Set((briefRows || []).map((b) => b.id))
  const missing = briefIds.filter((id) => !foundBriefIds.has(id))
  if (missing.length > 0) return NextResponse.json({ ok: false, error: `brief(s) not found: ${missing.join(', ')}` }, { status: 400 })

  const briefClientIds = new Set((briefRows || []).map((b) => b.client_id).filter((id): id is string => Boolean(id)))
  if (briefClientIds.size > 1) return NextResponse.json({ ok: false, error: 'the selected briefs belong to different clients' }, { status: 409 })
  const candidateClientId = [...briefClientIds][0] ?? null

  const service = createServiceClient()
  const { error: lockErr } = await service.rpc('sw_lock_batch_client', {
    p_batch_id: batchId, p_created_by: userId, p_candidate_client_id: candidateClientId,
  })
  if (lockErr) {
    const msg = lockErr.message || 'failed to lock batch client'
    if (msg.includes('batch_client_conflict')) return NextResponse.json({ ok: false, error: 'all briefs in a batch must belong to the same client' }, { status: 409 })
    if (msg.includes('client not found')) return NextResponse.json({ ok: false, error: 'client not found or inactive' }, { status: 400 })
    if (msg.includes('not authorized')) return NextResponse.json({ ok: false, error: 'not authorized for this batch' }, { status: 403 })
    if (msg.includes('batch not found')) return NextResponse.json({ ok: false, error: 'batch not found' }, { status: 404 })
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }

  // ── Persona scoping ────────────────────────────────────────────────────────
  // Mirror the brief check above: every requested persona_id must belong to
  // this user AND be visible in this batch's client workspace (its own
  // client_id, or shared/null). Without this, a persona_id from a request the
  // client never should have been able to construct (e.g. a stale/crafted
  // value) would silently enqueue jobs voiced by a persona outside this scope.
  const personaIds = [...new Set(items.map((i) => i.persona_id).filter((id): id is string => Boolean(id)))]
  if (personaIds.length > 0) {
    const { data: personaRows, error: personaErr } = await authClient
      .from('sw_personas').select('id, client_id').eq('created_by', userId).eq('is_active', true).in('id', personaIds)
    if (personaErr) return NextResponse.json({ ok: false, error: personaErr.message }, { status: 500 })
    const validIds = new Set(
      (personaRows || []).filter((p) => !p.client_id || p.client_id === candidateClientId).map((p) => p.id),
    )
    const invalid = personaIds.filter((id) => !validIds.has(id))
    if (invalid.length > 0) {
      return NextResponse.json({ ok: false, error: `persona(s) not found or outside this batch's client: ${invalid.join(', ')}` }, { status: 400 })
    }
  }

  // ── Enqueue one job per (brief × persona × day) item ──────────────────────
  // Dedupe against jobs already enqueued for this batch so a retry (after a
  // partial insert, a double-click, or a transient error) is idempotent — no
  // duplicate naskah / wasted Gemini quota. gen_jobs has no unique constraint
  // (persona_id is nullable), so we dedupe in code.
  //
  // day_no is part of the identity: without it, days 2..N of the same
  // brief × persona look like duplicates of day 1 and get dropped on retry.
  // `seen` is also updated as we go, so a payload that repeats the same
  // (brief, persona, day) triple within ONE request collapses too — it
  // previously only checked against already-persisted jobs.
  const key = (briefId: string, personaId: string | null | undefined, dayNo: number | null | undefined) =>
    `${briefId}|${personaId ?? ''}|${dayNo ?? ''}`
  const { data: existing } = await service.from('sw_gen_jobs').select('brief_id, persona_id, day_no').eq('batch_id', batchId)
  const seen = new Set((existing || []).map((j) => key(j.brief_id, j.persona_id, j.day_no)))
  const rows: Array<Record<string, unknown>> = []
  for (const it of items) {
    const k = key(it.brief_id, it.persona_id, it.day_no)
    if (seen.has(k)) continue
    seen.add(k)
    rows.push({
      created_by: userId,
      batch_id: batchId,
      brief_id: it.brief_id,
      persona_id: it.persona_id ?? null,
      extra_context: it.extra_context?.trim() || null,
      content_format: it.content_format?.trim() || null,
      day_no: it.day_no ?? null,
      day_total: it.day_total ?? null,
      status: 'pending' as const,
    })
  }
  if (rows.length === 0) return NextResponse.json({ ok: true, enqueued: 0, batch_id: batchId })

  // Insert in chunks so a big fan-out (1000+ jobs) never hits a request-body limit.
  // upsert + ignoreDuplicates (ON CONFLICT DO NOTHING against the unique index
  // from migration 016) rather than a plain insert: the `seen` check above is a
  // read-then-write, so two concurrent enqueues for the same batch can both
  // pass it and double-insert. Letting the DB arbitrate makes a racing retry
  // silently no-op instead of burning a duplicate Gemini call.
  const INSERT_CHUNK = 500
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const { error: insErr } = await service
      .from('sw_gen_jobs')
      .upsert(rows.slice(i, i + INSERT_CHUNK), { onConflict: 'batch_id,brief_id,persona_id,day_no', ignoreDuplicates: true })
    if (insErr) return NextResponse.json({ ok: false, error: `failed to enqueue: ${insErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, enqueued: rows.length, batch_id: batchId })
}
