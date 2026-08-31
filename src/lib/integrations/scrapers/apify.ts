// Apify `apify/instagram-scraper` — the paid last resort for Instagram.
//
// Deliberately LAST in the chain. It is billed per result ($2.70 / 1,000), so
// it must only run once every free source has failed: Zapi first, then RapidAPI
// if configured, then Instagram's own public metadata, and only then this.
//
// What it gives back in ONE call (verified live against @awshomedecor):
//   followersCount 2661 · postsCount 380 · 12 latestPosts with likesCount,
//   commentsCount, videoViewCount, timestamp and type
// — an exact match for what Instagram's own profile page shows, where Zapi
// returned 0. Roughly 33s per run, which is why the strategist route budgets
// 300s.
//
// Uses run-sync-get-dataset-items: the run blocks until it finishes and returns
// the dataset directly, so there is no polling loop to get wrong.

const ACTOR = 'apify~instagram-scraper'
const BASE = 'https://api.apify.com/v2/acts'
const TIMEOUT_MS = Number(process.env.APIFY_TIMEOUT_MS) || 150_000

export function apifyConfigured(): boolean {
  return !!process.env.APIFY_TOKEN
}

export class ApifyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ApifyError'
  }
}

export type ApifyIgPost = {
  id?: string
  type?: string // "Video" | "Image" | "Sidecar"
  productType?: string // "clips" for Reels
  shortCode?: string
  caption?: string
  likesCount?: number
  commentsCount?: number
  videoViewCount?: number
  videoUrl?: string
  timestamp?: string
  /** Instagram's own place name on geotagged posts, e.g. "Jakarta, Indonesia". */
  locationName?: string
}

export type ApifyIgProfile = {
  username?: string
  fullName?: string
  biography?: string
  followersCount?: number
  followsCount?: number
  postsCount?: number
  verified?: boolean
  private?: boolean
  profilePicUrlHD?: string
  profilePicUrl?: string
  latestPosts?: ApifyIgPost[]
}

/**
 * Profile details + the latest posts for one Instagram account.
 *
 * `resultsType: 'details'` is the cheapest useful shape — one dataset item that
 * already embeds the recent posts, so no second call is needed.
 */
/** Shared runner for the sync endpoint: the run blocks, then returns the dataset. */
async function runActor<T>(actor: string, input: unknown): Promise<T[]> {
  const token = process.env.APIFY_TOKEN
  if (!token) throw new ApifyError('APIFY_TOKEN is not set', 0)

  const res = await fetch(`${BASE}/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApifyError(body.slice(0, 200) || `Apify run failed (HTTP ${res.status})`, res.status)
  }

  const items = await res.json().catch(() => null)
  return Array.isArray(items) ? (items as T[]) : []
}

/**
 * Profile details + latest posts for one or more Instagram accounts.
 *
 * BATCHED ON PURPOSE. One account per run took 33s; six accounts in a single run
 * took 16.6s total — 2.8s each. Since Apify bills per result rather than per run,
 * batching costs the same and is roughly twelve times faster, which is the
 * difference between a usable feature and one nobody waits for.
 */
export async function fetchApifyInstagramProfiles(handles: string[]): Promise<ApifyIgProfile[]> {
  const clean = handles.map((h) => (h || '').replace(/^@/, '').trim()).filter(Boolean)
  if (!clean.length) return []
  return runActor<ApifyIgProfile>(ACTOR, {
    directUrls: clean.map((h) => `https://www.instagram.com/${h}/`),
    resultsType: 'details',
    resultsLimit: 1,
  })
}

/** Convenience wrapper for the single-account case. */
export async function fetchApifyInstagramProfile(handle: string): Promise<ApifyIgProfile | null> {
  const [first] = await fetchApifyInstagramProfiles([handle])
  return first ?? null
}

export interface ApifyIgHashtagPost {
  id?: string
  type?: string
  shortCode?: string
  caption?: string
  hashtags?: string[]
  url?: string
  commentsCount?: number
  likesCount?: number
  videoViewCount?: number
  timestamp?: string
  productType?: string
  /** Present on geotagged posts. Instagram's own place name, e.g. "Jakarta, Indonesia". */
  locationName?: string
  locationId?: string
  ownerUsername?: string
  ownerFullName?: string
  ownerId?: string
}

/**
 * Instagram DISCOVERY — posts under a hashtag.
 *
 * The only reason Instagram is possible at all. Zapi's seven Instagram endpoints
 * every one require a handle you already know, so there is no free path from a
 * niche to a list of creators.
 *
 * Measured live on #skincareindonesia: 8.5s, 27 posts, 25 unique owners, and
 * 5 of 27 carried a real place tag — location data TikTok never provides.
 */
export async function fetchApifyInstagramHashtag(hashtag: string, limit = 40): Promise<ApifyIgHashtagPost[]> {
  const tag = hashtag.replace(/^#/, '').trim()
  if (!tag) return []
  return runActor<ApifyIgHashtagPost>('apify~instagram-hashtag-scraper', {
    hashtags: [tag],
    resultsLimit: Math.max(1, Math.min(200, limit)),
  })
}
