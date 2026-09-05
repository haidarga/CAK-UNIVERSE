import { fetchTikTokPosts, normalizeHandle, type ZapiTikTokVideo } from '@/lib/integrations/scrapers/zapi'
import { mapWithConcurrency } from '@/lib/kol/resolve'
import type { KolPerformance } from '@/lib/kol/types'

// Stage 3 — how a creator actually performs.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS MAKES ITS OWN CALLS INSTEAD OF REUSING DISCOVERY DATA
//
// Discovery already handed us videos for every candidate, so averaging those
// looks free. It is also completely wrong, and wrong in the direction that does
// the most damage: it promotes dead accounts and buries good ones.
//
// A hashtag feed is ordered by TikTok's virality ranking, not by recency. What
// lands in it is a creator's single best video, whenever it happened. Measured
// live on #skincareindonesia:
//
//   @glowbyme_    hashtag feed said 615% engagement — top of the list.
//                 Own feed: 663 avg views, 8 avg likes, last post 16 months ago.
//   @kseputaran   hashtag feed said 0.2% — flagged as bought followers.
//                 Own feed: 1.1M avg views, 37k avg likes, posted that same day.
//
// The ranking inverts the truth. Shipping the free version would have made a
// dormant account the number-one recommendation and discarded a strong creator
// as fake. One extra call per surviving candidate buys an unbiased sample.
//
// This is why the pipeline filters by tier and country BEFORE reaching here:
// the honest measurement is the expensive one, so it only runs on accounts that
// already cleared the cheap checks.
// ─────────────────────────────────────────────────────────────────────────────

const ENRICH_CONCURRENCY = 12
const SAMPLE_SIZE = 20

// A ceiling on the whole stage, matching the one on resolve. Measuring 80
// creators at two seconds each is fine; measuring 80 where a dozen are cold and
// each costs the full per-call timeout is what turned a sweep into 154 seconds.
// Creators not reached keep their follower count and appear without performance
// data, which the UI already renders as unknown rather than zero.
const ENRICH_BUDGET_MS = 45_000
const PER_CALL_TIMEOUT_MS = 15_000
const MS_PER_DAY = 86_400_000

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
}

function average(values: (number | null)[]): number | null {
  const real = values.filter((v): v is number => v !== null)
  if (!real.length) return null
  return Math.round(real.reduce((a, b) => a + b, 0) / real.length)
}

/** Median, not mean: one three-month hiatus should not redefine a weekly poster. */
function medianGapDays(isoDates: string[]): number | null {
  const times = isoDates
    .map((d) => Date.parse(d))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a)
  if (times.length < 3) return null
  const gaps: number[] = []
  for (let i = 0; i < times.length - 1; i++) gaps.push((times[i] - times[i + 1]) / MS_PER_DAY)
  gaps.sort((a, b) => a - b)
  const mid = Math.floor(gaps.length / 2)
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2
  return Math.round(median * 10) / 10
}

export function performanceFromVideos(videos: ZapiTikTokVideo[], now = Date.now()): KolPerformance {
  // Ads are bought placements. Their reach reflects a media budget, not an
  // audience, so they would inflate every average they touch.
  const organic = videos.filter((v) => !v.isAd)
  const avgViews = average(organic.map((v) => num(v.playCount)))
  const avgLikes = average(organic.map((v) => num(v.diggCount)))
  const avgComments = average(organic.map((v) => num(v.commentCount)))

  // Engagement is computed ONLY over posts that carry BOTH numbers.
  //
  // Averaging views over one set of posts and likes over another produces a
  // ratio between two different populations. On Instagram, where photos have no
  // view count at all, that yielded figures like 802%. TikTok has a milder form
  // of the same flaw — slideshow posts often carry no playCount — and the fix is
  // identical: pair them first, divide second.
  const paired = organic.filter((v) => num(v.playCount) !== null && num(v.diggCount) !== null && (v.playCount ?? 0) > 0)
  const pairedViews = average(paired.map((v) => num(v.playCount)))
  const pairedLikes = average(paired.map((v) => num(v.diggCount)))

  // Likes ÷ VIEWS, never likes ÷ followers.
  //
  // TikTok distributes through the For You feed, so reach is largely decoupled
  // from follower count. Measured live: a 56k-follower account averaging 1.1M
  // views produces a 66% "engagement rate" on a follower basis — an impossible
  // number that would rank it above every honest account in the list. On a view
  // basis the same creator reads 3.3%, directly comparable to everyone else.
  const engagementRate =
    pairedViews !== null && pairedViews > 0 && pairedLikes !== null
      ? Math.round((pairedLikes / pairedViews) * 1000) / 10
      : null

  const dates = organic.map((v) => v.createTimeIso).filter((d): d is string => !!d)
  const newest = dates.map((d) => Date.parse(d)).filter((t) => Number.isFinite(t)).sort((a, b) => b - a)[0]

  return {
    sampleSize: organic.length,
    avgViews,
    avgLikes,
    avgComments,
    engagementRate,
    lastPostAt: newest ? new Date(newest).toISOString() : null,
    daysSinceLastPost: newest ? Math.max(0, Math.floor((now - newest) / MS_PER_DAY)) : null,
    postingCadenceDays: medianGapDays(dates),
  }
}

function extractVideos(payload: unknown): ZapiTikTokVideo[] {
  if (Array.isArray(payload)) return payload as ZapiTikTokVideo[]
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>
    for (const key of ['videos', 'posts', 'items']) {
      if (Array.isArray(o[key])) return o[key] as ZapiTikTokVideo[]
    }
  }
  return []
}

export interface EnrichedCreator {
  handle: string
  performance: KolPerformance | null
  /** Captions from the unbiased sample, for niche classification downstream. */
  captions: string[]
  /**
   * Real place tags attached to posts. Instagram supplies these; TikTok does
   * not, so on TikTok this is always empty and location falls back to text.
   */
  geoTags: string[]
}

export async function enrichHandles(handles: string[]): Promise<Map<string, EnrichedCreator>> {
  const out = new Map<string, EnrichedCreator>()
  const deadline = Date.now() + ENRICH_BUDGET_MS

  const results = await mapWithConcurrency(handles, ENRICH_CONCURRENCY, async (handle) => {
    const clean = normalizeHandle(handle)
    // Workers reaching the front of a deep queue after the budget is spent give
    // up without opening a request.
    if (Date.now() >= deadline) return { handle, performance: null, captions: [], geoTags: [] }

    // One retry, because the provider returns transient 503s under load —
    // observed live at roughly two failures in seven during a single sweep.
    // Without it those creators render with no engagement, no activity and a
    // depressed score, which looks like a judgement about them rather than a
    // hiccup on our side.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const left = deadline - Date.now()
        if (left <= 0) break
        const payload = await fetchTikTokPosts(clean, SAMPLE_SIZE, Math.min(PER_CALL_TIMEOUT_MS, left))
        const videos = extractVideos(payload)
        // An empty list is a real answer for a brand-new account, so it is not
        // retried — only a thrown error is.
        if (!videos.length) return { handle, performance: null, captions: [], geoTags: [] }
        return {
          handle,
          performance: performanceFromVideos(videos),
          captions: videos.map((v) => v.title || '').filter(Boolean).slice(0, SAMPLE_SIZE),
          geoTags: [],
        }
      } catch {
        if (attempt === 0) await new Promise((r) => setTimeout(r, 1_200))
      }
    }

    // A creator we cannot measure still belongs in the list with their measured
    // follower count — they just carry no performance data, and the UI shows
    // that gap rather than a zero.
    return { handle, performance: null, captions: [], geoTags: [] }
  })
  for (const r of results) out.set(r.handle, r)
  return out
}
