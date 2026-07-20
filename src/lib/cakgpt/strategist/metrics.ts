import type { ScrapedAccount, AccountMetrics } from '@/lib/cakgpt/strategist/types'

// Pure, deterministic derivation of AccountMetrics from a ScrapedAccount.
// No I/O, no randomness — same input always yields the same output, which is
// exactly why these numbers get the "Data Aktual" (green) treatment in the UI
// while the LLM estimate gets "Estimasi" (yellow). Keep it that way.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
// Don't report a posting cadence extrapolated from a razor-thin sample: two
// posts an hour apart would otherwise read as "168/week" under the measured
// banner. Require a few dated posts across a meaningful span first.
const MIN_CADENCE_POSTS = 3
const MIN_CADENCE_SPAN_MS = 2 * 24 * 60 * 60 * 1000 // 48h

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function round(n: number, dp = 0): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

// Posts per week from the spread between the newest and oldest dated post.
// Returns null unless we have enough dated posts across a wide enough span to
// avoid a misleading extrapolation from a tiny sample.
function computePostsPerWeek(posts: ScrapedAccount['recentPosts']): number | null {
  const times = posts
    .map((p) => (p.takenAt ? Date.parse(p.takenAt) : NaN))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)
  if (times.length < MIN_CADENCE_POSTS) return null
  const spanMs = times[times.length - 1] - times[0]
  if (spanMs < MIN_CADENCE_SPAN_MS) return null
  const weeks = spanMs / WEEK_MS
  // (count - 1) intervals across the observed span.
  return round((times.length - 1) / weeks, 1)
}

// Average over the samples that actually carry a value, so a missing/unparsed
// metric is excluded from the denominator instead of counted as a real 0.
function avgPresent(values: Array<number | null | undefined>): number | null {
  const present = values.filter((v): v is number => typeof v === 'number' && v >= 0)
  return present.length > 0 ? round(mean(present)) : null
}

// sampleSize caps how many of the most-recent posts feed the averages (the
// scraper stores up to ~30, recent-first). Undefined/0 = use all cached posts.
export function computeMetrics(account: ScrapedAccount, sampleSize?: number): AccountMetrics {
  const posts =
    sampleSize && sampleSize > 0 ? account.recentPosts.slice(0, sampleSize) : account.recentPosts
  const followers = Math.max(0, account.followers || 0)

  // Every average excludes unparsed/missing samples so a partial provider
  // payload can't fabricate zeros into these "measured" numbers.
  const avgViews = avgPresent(posts.map((p) => p.views))
  const avgLikes = avgPresent(posts.map((p) => p.likes))
  const avgComments = avgPresent(posts.map((p) => p.comments))
  const avgShares = avgPresent(posts.map((p) => p.shares))

  // Reach basis: prefer avg views (true reach); fall back to followers when the
  // platform hides views (typical for IG feed). Engagement is meaningless
  // without a positive denominator, so guard against divide-by-zero.
  // Basis by platform convention: TikTok reach ≈ views; Instagram ER is the
  // industry-standard interactions/followers (feed photos have no public views,
  // and mixing sparse Reel views with photo likes would skew the ratio).
  const useViews = account.platform === 'tiktok' && avgViews !== null && avgViews > 0
  const reach = useViews ? (avgViews as number) : followers
  const interactions = (avgLikes ?? 0) + (avgComments ?? 0) + (avgShares ?? 0)
  const engagementRatePct = reach > 0 ? round((interactions / reach) * 100, 2) : 0

  return {
    followers,
    postsAnalyzed: posts.length,
    avgViews,
    avgLikes,
    avgComments,
    avgShares,
    engagementRatePct,
    engagementBasis: useViews ? 'views' : 'followers',
    postsPerWeek: computePostsPerWeek(posts),
  }
}
