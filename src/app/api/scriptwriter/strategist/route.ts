import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { getActiveClientId } from '@/lib/cakgpt/active-client'
import { analyzeAccountUrl } from '@/lib/cakgpt/strategist'

// POST /api/strategist — Strategist Mode: paste a TikTok/IG account link, get
// real metrics + an AI economic estimate. Auth-gated; the URL is validated
// (host allowlist) inside analyzeAccountUrl before anything downstream runs.

export const runtime = 'nodejs'
export const maxDuration = 60

const BodySchema = z.object({
  url: z.string().min(1).max(500),
  force_refresh: z.boolean().optional(),
  // How many recent posts to average over. Bounded to what the scraper caches.
  sample_size: z.number().int().min(3).max(30).optional(),
})

export async function POST(req: Request) {
  const authClient = await createServerClient()
  const { user, unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Link wajib diisi.' }, { status: 400 })
  }

  const service = createServiceClient()

  // Scope the cache to the active workspace so each client's analyses stay
  // separate. Verify the cookie's client actually belongs to this user (same
  // guard briefs/batches use) before it flows into the cache key.
  let clientId = await getActiveClientId()
  if (clientId) {
    const { data: owned } = await service
      .from('sw_clients')
      .select('id')
      .eq('id', clientId)
      .eq('created_by', user.id)
      .eq('is_active', true)
      .maybeSingle()
    if (!owned) clientId = null
  }

  const result = await analyzeAccountUrl({
    supabase: service,
    userId: user.id,
    url: parsed.data.url,
    clientId,
    forceRefresh: parsed.data.force_refresh,
    sampleSize: parsed.data.sample_size,
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, report: result.report })
}
