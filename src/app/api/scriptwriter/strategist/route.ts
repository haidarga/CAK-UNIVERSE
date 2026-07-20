import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
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
  const result = await analyzeAccountUrl({
    supabase: service,
    userId: user.id,
    url: parsed.data.url,
    forceRefresh: parsed.data.force_refresh,
    sampleSize: parsed.data.sample_size,
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, report: result.report })
}
