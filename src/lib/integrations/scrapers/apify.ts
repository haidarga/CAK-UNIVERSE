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
export async function fetchApifyInstagramProfile(handle: string): Promise<ApifyIgProfile | null> {
  const token = process.env.APIFY_TOKEN
  if (!token) throw new ApifyError('APIFY_TOKEN is not set', 0)

  const clean = (handle || '').replace(/^@/, '').trim()
  if (!clean) return null

  const res = await fetch(`${BASE}/${ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      directUrls: [`https://www.instagram.com/${clean}/`],
      resultsType: 'details',
      resultsLimit: 1,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApifyError(
      body.slice(0, 200) || `Apify run failed (HTTP ${res.status})`,
      res.status,
    )
  }

  const items = await res.json().catch(() => null)
  if (!Array.isArray(items) || items.length === 0) return null
  return items[0] as ApifyIgProfile
}
