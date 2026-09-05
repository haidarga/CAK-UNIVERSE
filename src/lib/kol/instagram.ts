import {
  apifyConfigured,
  fetchApifyInstagramHashtag,
  fetchApifyInstagramProfiles,
  ApifyError,
  type ApifyIgHashtagPost,
  type ApifyIgProfile,
} from '@/lib/integrations/scrapers/apify'
import type { EnrichedCreator } from '@/lib/kol/enrich'
import type { KolCandidate, KolPerformance, KolProfile } from '@/lib/kol/types'

// Instagram, via Apify.
//
// WHY THIS LOOKS NOTHING LIKE THE TIKTOK PATH
//
// TikTok gets three free discovery endpoints and a per-handle stats lookup, so
// its pipeline can be cheap and chatty. Instagram gets neither: every one of
// Zapi's seven Instagram endpoints requires a handle you already have, which
// makes free discovery impossible. Apify is the only route, it is billed per
// result, and one profile at a time takes 33 seconds.
//
// So this path is shaped around batching. Discovery is one call. Enrichment is
// ONE call for up to N accounts — measured at 2.8s per account batched versus 33s
// alone, at identical cost, because Apify bills results and not runs.
//
// It also comes out ahead in one place: Instagram attaches real place names to
// posts. TikTok never does, so Instagram location detection rests on actual geo
// tags rather than on reading captions.

const MS_PER_DAY = 86_400_000
// Apify accepts more, but a run that dies takes the whole batch with it. Chunks
// keep one bad account from costing every other account in the sweep.
const PROFILE_BATCH = 25

export function instagramConfigured(): boolean {
  return apifyConfigured()
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
}

function average(values: (number | null)[]): number | null {
  const real = values.filter((v): v is number => v !== null)
  if (!real.length) return null
  return Math.round(real.reduce((a, b) => a + b, 0) / real.length)
}

export function igProfileFrom(p: ApifyIgProfile): KolProfile {
  const handle = (p.username || '').toLowerCase()
  return {
    handle,
    displayName: p.fullName || null,
    bio: p.biography || null,
    followers: num(p.followersCount),
    following: num(p.followsCount),
    totalVideos: num(p.postsCount),
    totalHearts: null, // Instagram publishes no lifetime like total.
    // Apify exposes no country field for Instagram. Left null rather than
    // defaulting to ID, so the country filter cannot silently pass everyone.
    country: null,
    verified: !!p.verified,
    isPrivate: !!p.private,
    avatarUrl: p.profilePicUrlHD || p.profilePicUrl || null,
    instagramHandle: handle,
    profileUrl: `https://www.instagram.com/${handle}/`,
  }
}

/**
 * Performance from a creator's own latest posts.
 *
 * Same discipline as TikTok: measured from the account's OWN feed, never from
 * the hashtag feed, which ranks by popularity and would promote dead accounts.
 *
 * Instagram differs in one honest way — likes are hidden on many posts, arriving
 * as 0. A zero that means "hidden" must not average in as a real zero, so posts
 * reporting no likes at all are excluded from the likes average instead of
 * dragging it to the floor.
 */
export function igPerformanceFrom(posts: NonNullable<ApifyIgProfile['latestPosts']>, now = Date.now()): KolPerformance {
  const organic = posts || []
  const videos = organic.filter((p) => p.type === 'Video' || p.productType === 'clips')

  const avgViews = average(videos.map((p) => num(p.videoViewCount)))
  const avgComments = average(organic.map((p) => num(p.commentsCount)))

  // Engagement uses ONLY posts carrying BOTH a view count and a like count.
  //
  // The previous version averaged likes across every post — photos included —
  // and divided by views taken from the videos alone. Those are two different
  // populations: eight photos at 500 likes over two Reels at 50 views reported
  // 802% engagement. Pair them first, then divide.
  const paired = videos.filter((p) => num(p.videoViewCount) !== null && (p.videoViewCount ?? 0) > 0 && num(p.likesCount) !== null && (p.likesCount ?? 0) > 0)
  const pairedViews = average(paired.map((p) => num(p.videoViewCount)))
  const pairedLikes = average(paired.map((p) => num(p.likesCount)))

  // Reported likes across everything, purely for display. Posts showing 0 are
  // excluded because Instagram hides counts on many posts and a hidden count is
  // not a measured zero — but that exclusion biases the average UPWARD, so when
  // a lot of posts hide their likes the number is unreliable and the sample size
  // below says so rather than the average pretending otherwise.
  const visibleLikes = organic.map((p) => num(p.likesCount)).filter((v) => v !== null && v > 0)
  const avgLikes = average(visibleLikes)

  const engagementRate =
    pairedViews !== null && pairedViews > 0 && pairedLikes !== null
      ? Math.round((pairedLikes / pairedViews) * 1000) / 10
      : null

  const times = organic
    .map((p) => Date.parse(p.timestamp || ''))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a)
  const newest = times[0]

  let cadence: number | null = null
  if (times.length >= 3) {
    const gaps: number[] = []
    for (let i = 0; i < times.length - 1; i++) gaps.push((times[i] - times[i + 1]) / MS_PER_DAY)
    gaps.sort((a, b) => a - b)
    const mid = Math.floor(gaps.length / 2)
    cadence = Math.round((gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2) * 10) / 10
  }

  return {
    // The sample that actually backs the engagement figure, not the raw post
    // count — a 12-post account whose ratio rests on two Reels must not look
    // like a 12-post measurement.
    sampleSize: paired.length || organic.length,
    avgViews,
    avgLikes,
    avgComments,
    engagementRate,
    lastPostAt: newest ? new Date(newest).toISOString() : null,
    daysSinceLastPost: newest ? Math.max(0, Math.floor((now - newest) / MS_PER_DAY)) : null,
    postingCadenceDays: cadence,
  }
}

export interface IgDiscoverOutcome {
  candidates: Map<string, KolCandidate>
  warnings: string[]
}

/** Stage 1 for Instagram: hashtag posts in, unique creator handles out. */
export async function discoverInstagram(hashtags: string[], limit: number): Promise<IgDiscoverOutcome> {
  const candidates = new Map<string, KolCandidate>()
  const warnings: string[] = []

  const pages = await Promise.all(
    hashtags.map((tag) =>
      fetchApifyInstagramHashtag(tag, limit).catch((e) => {
        warnings.push(
          e instanceof ApifyError && e.status === 402
            ? 'Kredit Apify habis — Instagram gak bisa dipakai sampai diisi.'
            : `Hashtag #${tag} gagal dibaca di Instagram.`,
        )
        return [] as ApifyIgHashtagPost[]
      }),
    ),
  )

  for (const posts of pages) {
    for (const post of posts) {
      const handle = (post.ownerUsername || '').toLowerCase()
      if (!handle) continue
      const entry = candidates.get(handle) ?? { handle, sources: ['hashtag' as const], seenVideos: [] }
      entry.seenVideos.push({
        videoId: post.shortCode ?? post.id ?? null,
        url: post.url ?? null,
        caption: post.caption ?? null,
        playCount: num(post.videoViewCount),
        diggCount: num(post.likesCount),
        commentCount: num(post.commentsCount),
        createTimeIso: post.timestamp ?? null,
        // Instagram's own place name, which is what makes IG location detection
        // stronger than TikTok's.
        region: post.locationName ?? null,
      })
      candidates.set(handle, entry)
    }
  }

  return { candidates, warnings }
}

/**
 * Stages 2 and 3 for Instagram, fused.
 *
 * One `details` run returns the profile AND its latest posts, so there is no
 * separate resolve step — which also means the tier filter cannot run before the
 * expensive call the way it does on TikTok. That is a property of the provider,
 * not a design choice, and it is why Instagram searches are capped lower.
 */
export async function resolveAndEnrichInstagram(
  handles: string[],
): Promise<{ profiles: Map<string, KolProfile>; enriched: Map<string, EnrichedCreator>; unresolved: string[] }> {
  const profiles = new Map<string, KolProfile>()
  const enriched = new Map<string, EnrichedCreator>()

  for (let i = 0; i < handles.length; i += PROFILE_BATCH) {
    const chunk = handles.slice(i, i + PROFILE_BATCH)
    let rows: ApifyIgProfile[] = []
    try {
      rows = await fetchApifyInstagramProfiles(chunk)
    } catch {
      // Lose this chunk, keep the rest. The unresolved list below reports it.
      continue
    }
    for (const row of rows) {
      const profile = igProfileFrom(row)
      if (!profile.handle) continue
      profiles.set(profile.handle, profile)
      const posts = row.latestPosts || []
      enriched.set(profile.handle, {
        handle: profile.handle,
        performance: posts.length ? igPerformanceFrom(posts) : null,
        captions: posts.map((p) => p.caption || '').filter(Boolean).slice(0, 20),
        geoTags: [...new Set(posts.map((p) => p.locationName || '').filter(Boolean))],
      })
    }
  }

  return { profiles, enriched, unresolved: handles.filter((h) => !profiles.has(h)) }
}
