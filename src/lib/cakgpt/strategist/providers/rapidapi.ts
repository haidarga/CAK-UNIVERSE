import type { Platform, ScrapedAccount, ScrapedPost, ScraperProvider } from '@/lib/cakgpt/strategist/types'
import { ScraperError } from '@/lib/cakgpt/strategist/errors'
import { pull, num, str, truthy, toIso, normalizeAccount } from '@/lib/cakgpt/strategist/providers/normalize'

// RapidAPI scraper adapter — concrete per-platform because the two subscribed
// APIs differ in method, params, and response shape, and neither returns
// everything in one call:
//
//   TikTok  → tiktok-scraper7.p.rapidapi.com
//             GET /user/info?unique_id={handle}         (profile + follower stats)
//             GET /user/posts?unique_id={handle}&count=  (recent videos → metrics)
//   Instagram → instagram120.p.rapidapi.com
//             POST /api/instagram/userInfo  {username}          (profile + followers)
//             POST /api/instagram/posts     {username, maxId}   (recent posts → metrics)
//
// Only RAPIDAPI_KEY is required — the hosts default to the subscribed ones and
// are env-overridable if you swap providers. Response shapes vary between
// RapidAPI vendors, so every field is pulled defensively (several candidate
// paths); if a provider's JSON differs, widen the path lists in normalize*.

const TIKTOK_HOST = process.env.RAPIDAPI_TIKTOK_HOST || 'tiktok-scraper7.p.rapidapi.com'
const IG_HOST = process.env.RAPIDAPI_INSTAGRAM_HOST || 'instagram120.p.rapidapi.com' // legacy post-based fallback
const IG_STATS_HOST = process.env.RAPIDAPI_INSTAGRAM_STATS_HOST || 'instagram-statistics-api.p.rapidapi.com'
// Which IG source to use: 'statistics' (default) | 'instagram120' (rate-limits fast).
const IG_PROVIDER = (process.env.RAPIDAPI_INSTAGRAM_PROVIDER || 'statistics').toLowerCase()
// Fetch a generous, fixed pool of recent posts and cache it once; the chosen
// sample size (7/15/30) is applied downstream in computeMetrics, so switching
// sizes recomputes from cache instead of re-scraping (saves quota).
const POST_COUNT = 30 // TikTok: recent videos to pull
const IG_POST_LIMIT = 30 // IG: recent posts to keep (Statistics /posts returns up to ~280)

// Field pickers and normalizers now live in ./normalize.ts, shared with the
// Zapi adapter — two copies of the candidate-path lists would drift apart.

// ── HTTP ─────────────────────────────────────────────────────────────────────
async function rapidFetch(host: string, path: string, init?: RequestInit): Promise<unknown> {
  const key = process.env.RAPIDAPI_KEY
  if (!key) throw new ScraperError('RAPIDAPI_KEY belum di-set — isi di .env.local, atau pakai STRATEGIST_SCRAPER=mock.')

  let res: Response
  try {
    res = await fetch(`https://${host}${path}`, {
      ...init,
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': host,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers || {}),
      },
      // Free tiers are slow; cap so a hung provider can't wedge the request.
      signal: AbortSignal.timeout(20_000),
    })
  } catch (e) {
    console.error('[strategist] scraper fetch failed:', e instanceof Error ? e.message : e)
    throw new ScraperError('Gagal menghubungi scraper, coba lagi.')
  }
  if (res.status === 429) throw new ScraperError('Kuota scraper habis (rate limit). Coba lagi nanti atau naikin plan.')
  if (res.status === 401 || res.status === 403) throw new ScraperError('Scraper menolak request — cek RAPIDAPI_KEY / subscription.')
  if (!res.ok) {
    console.error(`[strategist] scraper ${host}${path.split('?')[0]} → ${res.status}`)
    throw new ScraperError(`Scraper error (${res.status}).`)
  }
  return res.json().catch(() => {
    throw new ScraperError('Scraper balikin response yang bukan JSON.')
  })
}

const enc = encodeURIComponent

// Instagram Statistics /posts requires DD.MM.YYYY date bounds.
function ddmmyyyy(dt: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(dt.getUTCDate())}.${p(dt.getUTCMonth() + 1)}.${dt.getUTCFullYear()}`
}

async function scrapeTikTok(handle: string): Promise<ScrapedAccount> {
  const [info, posts] = await Promise.all([
    rapidFetch(TIKTOK_HOST, `/user/info?unique_id=${enc(handle)}`),
    rapidFetch(TIKTOK_HOST, `/user/posts?unique_id=${enc(handle)}&count=${POST_COUNT}&cursor=0`),
  ])
  return normalizeAccount('tiktok', handle, info, posts, 'rapidapi')
}

// instagram120: raw posts (2 calls). Kept as a fallback — rate-limits fast on the free tier.
async function scrapeInstagram120(handle: string): Promise<ScrapedAccount> {
  const [info, posts] = await Promise.all([
    rapidFetch(IG_HOST, '/api/instagram/userInfo', { method: 'POST', body: JSON.stringify({ username: handle }) }),
    rapidFetch(IG_HOST, '/api/instagram/posts', { method: 'POST', body: JSON.stringify({ username: handle, maxId: '' }) }),
  ])
  return normalizeAccount('instagram', handle, info, posts, 'rapidapi')
}

// Instagram Statistics API. Two endpoints, both verified live:
//   /community?url=  → profile (usersCount, name, description, image, verified,
//                      tags, type, country) + only the 3 most-recent posts.
//   /posts?url=&from=DD.MM.YYYY&to=DD.MM.YYYY → up to ~280 posts, each with
//                      likes/comments/views/videoViews/date/text/hashTags/type.
// Profile comes from /community; the (far more representative) post sample from
// /posts — the 3 in /community can all be same-day low-engagement outliers.
// /posts is best-effort: if it errors (quota), we fall back to the 3.
function mapIgStatsPost(p: unknown): ScrapedPost {
  const hashTags = pull(p, ['hashTags'])
  const tagStr = Array.isArray(hashTags)
    ? hashTags.filter((t) => typeof t === 'string').map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')
    : ''
  const text = str(pull(p, ['text', 'caption'])) || ''
  return {
    id: str(pull(p, ['postID', 'socialPostID', 'dataId', 'url'])),
    views: num(pull(p, ['views', 'videoViews', 'playCount'])), // Reels only; feed photos have none
    likes: num(pull(p, ['likes', 'likesCount'])),
    comments: num(pull(p, ['comments', 'commentsCount'])),
    shares: num(pull(p, ['rePosts', 'shares'])),
    saves: null,
    takenAt: toIso(pull(p, ['date', 'takenAt', 'timestamp'])),
    caption: [text, tagStr].filter(Boolean).join(' ').slice(0, 300) || null,
  }
}

async function scrapeInstagramStatistics(handle: string): Promise<ScrapedAccount> {
  const profileUrl = `https://www.instagram.com/${handle}/`
  const to = new Date()
  const from = new Date(to.getTime() - 365 * 24 * 60 * 60 * 1000)

  const [communityRaw, postsRaw] = await Promise.all([
    rapidFetch(IG_STATS_HOST, `/community?url=${enc(profileUrl)}`),
    rapidFetch(IG_STATS_HOST, `/posts?url=${enc(profileUrl)}&from=${ddmmyyyy(from)}&to=${ddmmyyyy(to)}`).catch(() => null),
  ])

  const c = pull(communityRaw, ['data']) ?? communityRaw
  const followers = num(pull(c, ['usersCount', 'followers', 'followersCount']))
  if (followers === null) {
    throw new ScraperError('Data akun IG nggak kebaca dari Statistics API — kemungkinan akun privat/nggak ada.')
  }

  // Prefer the fuller /posts feed; fall back to the 3 posts in /community.
  const fullList = pull(postsRaw, ['data.posts', 'data.items', 'posts', 'items'])
  const communityPosts = pull(c, ['lastPosts', 'posts'])
  const source: unknown[] =
    Array.isArray(fullList) && fullList.length > 0 ? fullList : Array.isArray(communityPosts) ? communityPosts : []

  const recentPosts: ScrapedPost[] = source
    .filter((p) => !truthy(pull(p, ['isAd'])) && !truthy(pull(p, ['isDeleted'])))
    .sort((a, b) => (Date.parse(str(pull(b, ['date'])) || '') || 0) - (Date.parse(str(pull(a, ['date'])) || '') || 0))
    .slice(0, IG_POST_LIMIT)
    .map(mapIgStatsPost)
    .filter((p) => p.likes !== null || p.comments !== null)

  // Niche/region signal for the AI: bio + tags + business type + country.
  const rawTags = pull(c, ['tags'])
  const tags = Array.isArray(rawTags)
    ? rawTags.map((t) => (typeof t === 'string' ? t : str(pull(t, ['tag', 'name', 'title'])))).filter(Boolean)
    : []
  const bio = [
    str(pull(c, ['description', 'bio'])),
    tags.length ? `Tags: ${tags.join(', ')}` : null,
    str(pull(c, ['type'])) ? `Tipe: ${str(pull(c, ['type']))}` : null,
    str(pull(c, ['country'])) ? `Negara: ${str(pull(c, ['country']))}` : null,
  ].filter(Boolean).join(' · ')

  return {
    platform: 'instagram',
    handle,
    displayName: str(pull(c, ['name', 'screenName', 'fullName'])),
    bio: bio || null,
    followers,
    following: num(pull(c, ['followingCount', 'follows'])),
    totalPosts: num(pull(c, ['postsCount', 'mediaCount'])),
    verified: truthy(pull(c, ['verified', 'isVerified'])),
    avatarUrl: str(pull(c, ['image', 'avatar', 'profilePicUrl'])),
    recentPosts,
    scrapedAt: new Date().toISOString(),
    provider: 'rapidapi:ig-statistics',
  }
}

async function scrapeInstagram(handle: string): Promise<ScrapedAccount> {
  return IG_PROVIDER === 'instagram120' ? scrapeInstagram120(handle) : scrapeInstagramStatistics(handle)
}

export const rapidApiProvider: ScraperProvider = {
  name: 'rapidapi',
  async scrape(platform: Platform, handle: string): Promise<ScrapedAccount> {
    return platform === 'tiktok' ? scrapeTikTok(handle) : scrapeInstagram(handle)
  },
}
