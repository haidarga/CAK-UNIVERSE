import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { getActiveClientId } from '@/lib/cakgpt/active-client'
import { runKolSearch } from '@/lib/kol/search'
import { KOL_TIER_IDS } from '@/lib/kol/tiers'
import type { KolProfile } from '@/lib/kol/types'

// POST /api/kol/search — "Mencari KOL yang Hilang".
//
// One request runs the whole four-stage sweep, so the ceiling is generous: a
// "dalam" search walks ten hashtag pages, resolves up to 180 handles at 8 in
// flight, then measures the top 70 and classifies their niches. Measured on a
// real cohort: ~100s for 61 candidates on the standard depth.

export const runtime = 'nodejs'
export const maxDuration = 300

const BodySchema = z.object({
  query: z.string().min(2).max(200),
  tiers: z.array(z.enum(KOL_TIER_IDS as unknown as [string, ...string[]])).default([]),
  region: z.string().max(60).nullable().default(null),
  // Defaults to Indonesia because every "indonesia" hashtag leaks Malaysian and
  // Thai creators — verified live on #skincareindonesia and #gamingindonesia.
  country: z.string().length(2).nullable().default('ID'),
  max_days_inactive: z.number().int().min(1).max(3650).nullable().default(180),
  depth: z.enum(['cepat', 'standar', 'dalam']).default('standar'),
  classify_niche: z.boolean().default(true),
  use_cache: z.boolean().default(true),
})

const CACHE_MAX_AGE_DAYS = 7

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
    return NextResponse.json({ ok: false, error: 'Kata kunci wajib diisi (minimal 2 huruf).' }, { status: 400 })
  }
  const input = parsed.data

  const service = createServiceClient()
  const clientId = await getActiveClientId().catch(() => null)

  // Warm the cache from previously scraped creators. Best-effort: a cache read
  // that fails must cost speed, never correctness, so it degrades to an empty
  // map and the sweep just does the work again.
  const cachedProfiles = new Map<string, KolProfile>()
  if (input.use_cache) {
    const cutoff = new Date(Date.now() - CACHE_MAX_AGE_DAYS * 86_400_000).toISOString()
    const { data } = await service
      .from('sw_kol_profiles')
      .select('handle, display_name, bio, followers, following, total_videos, total_hearts, country, verified, is_private, avatar_url, instagram_handle, profile_url')
      .eq('platform', 'tiktok')
      .gte('scraped_at', cutoff)
      .limit(5000)
    for (const row of data || []) {
      cachedProfiles.set(row.handle, {
        handle: row.handle,
        displayName: row.display_name,
        bio: row.bio,
        followers: row.followers,
        following: row.following,
        totalVideos: row.total_videos,
        totalHearts: row.total_hearts,
        country: row.country,
        verified: !!row.verified,
        isPrivate: !!row.is_private,
        avatarUrl: row.avatar_url,
        instagramHandle: row.instagram_handle,
        profileUrl: row.profile_url || `https://www.tiktok.com/@${row.handle}`,
      })
    }
  }

  // Streamed as newline-delimited JSON rather than returned in one shot.
  //
  // A full sweep runs ~90-100s. Holding the connection silent for that long
  // looks identical to a hang, and the platform's own idle timeouts can cut it.
  // Each line is either {type:'progress'} from a real stage boundary or the
  // final {type:'result'} — so the UI narrates what is actually happening
  // instead of animating a fake bar.
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(payload) + '\n'))
        } catch {
          // Client navigated away mid-search; the sweep below still finishes so
          // its results reach the cache.
        }
      }

      try {
        const response = await runKolSearch(
          {
            platform: 'tiktok',
            query: input.query,
            tiers: input.tiers as never,
            region: input.region,
            country: input.country,
            maxDaysInactive: input.max_days_inactive,
            depth: input.depth,
          },
          {
            cachedProfiles,
            classifyNiche: input.classify_niche,
            onProgress: (event) => send({ type: 'progress', ...event }),
          },
        )
        await persist(service, user.id, clientId, input, response)
        send({ type: 'result', ok: true, ...response })
      } catch (e) {
        send({ type: 'error', ok: false, error: e instanceof Error ? e.message : 'Pencarian gagal.' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      // Proxies that buffer would defeat the whole point of streaming.
      'x-accel-buffering': 'no',
    },
  })
}

/**
 * Writes the cache and the audit row. Best-effort by design: a storage hiccup
 * must not discard a search the user already waited a minute and a half for.
 */
async function persist(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  clientId: string | null,
  input: z.infer<typeof BodySchema>,
  response: Awaited<ReturnType<typeof runKolSearch>>,
): Promise<void> {
  try {
    if (response.results.length) {
      const now = new Date().toISOString()
      const rows = response.results.map((r) => ({
        platform: 'tiktok',
        handle: r.profile.handle,
        display_name: r.profile.displayName,
        bio: r.profile.bio,
        followers: r.profile.followers,
        following: r.profile.following,
        total_videos: r.profile.totalVideos,
        total_hearts: r.profile.totalHearts,
        country: r.profile.country,
        verified: r.profile.verified,
        is_private: r.profile.isPrivate,
        avatar_url: r.profile.avatarUrl,
        instagram_handle: r.profile.instagramHandle,
        profile_url: r.profile.profileUrl,
        perf: r.performance,
        scraped_at: now,
        updated_at: now,
      }))
      await service.from('sw_kol_profiles').upsert(rows, { onConflict: 'platform,handle' })
    }

    await service.from('sw_kol_searches').insert({
      client_id: clientId,
      created_by: userId,
      platform: 'tiktok',
      query: input.query,
      tiers: input.tiers,
      region: input.region,
      country: input.country,
      depth: input.depth,
      max_days_inactive: input.max_days_inactive,
      result: response,
      result_count: response.results.length,
      elapsed_ms: response.meta.elapsedMs,
    })
  } catch (e) {
    console.warn('[kol] gagal menyimpan hasil pencarian:', e instanceof Error ? e.message : e)
  }
}
