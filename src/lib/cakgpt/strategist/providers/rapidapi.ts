import type { Platform, ScrapedAccount, ScrapedPost, ScraperProvider } from '@/lib/cakgpt/strategist/types'
import { ScraperError } from '@/lib/cakgpt/strategist/errors'

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

// ── Defensive field pickers ──────────────────────────────────────────────────
function pull(obj: unknown, paths: string[]): unknown {
  for (const path of paths) {
    let cur: unknown = obj
    let ok = true
    for (const seg of path.split('.')) {
      if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[seg]
      } else {
        ok = false
        break
      }
    }
    if (ok && cur !== undefined && cur !== null) return cur
  }
  return undefined
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/[, ]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

// Providers report verification as true | "true" | 1 — normalize them all.
function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === 'true' || v === '1'
}

function toIso(v: unknown): string | null {
  const n = num(v)
  if (n !== null && n > 0) {
    // Heuristic: 13-digit = ms epoch, else seconds.
    const ms = n > 1e12 ? n : n * 1000
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  const s = str(v)
  if (s) {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return null
}

// ── Normalizers (shared across platforms via broad candidate paths) ──────────
function normalizePosts(raw: unknown): ScrapedPost[] {
  const list = pull(raw, [
    'data.videos', 'videos', // tiktok-scraper7
    'data.items', 'items', 'result.items', 'result', // instagram120 variants
    'data.data.items', 'data.posts', 'posts', 'aweme_list',
    'data.user.edge_owner_to_timeline_media.edges', 'edges', // IG GraphQL
  ]) as unknown[]
  if (!Array.isArray(list)) return []
  return list
    .map((entry): ScrapedPost | null => {
      // IG GraphQL wraps each post in { node: {...} } — unwrap it.
      const item =
        entry && typeof entry === 'object' && 'node' in (entry as Record<string, unknown>)
          ? (entry as Record<string, unknown>).node
          : entry
      const likes = num(pull(item, ['digg_count', 'like_count', 'likes', 'statistics.digg_count', 'edge_liked_by.count', 'edge_media_preview_like.count']))
      const comments = num(pull(item, ['comment_count', 'comments', 'statistics.comment_count', 'edge_media_to_comment.count']))
      if (likes === null && comments === null) return null
      return {
        id: str(pull(item, ['id', 'aweme_id', 'pk', 'video_id', 'shortcode', 'code'])),
        views: num(pull(item, ['play_count', 'view_count', 'views', 'statistics.play_count', 'video_view_count', 'ig_play_count'])),
        likes,
        comments,
        shares: num(pull(item, ['share_count', 'shares', 'statistics.share_count', 'reshare_count'])),
        saves: num(pull(item, ['collect_count', 'save_count', 'saved'])),
        takenAt: toIso(pull(item, ['create_time', 'created_at', 'taken_at', 'taken_at_timestamp', 'timestamp', 'device_timestamp'])),
        caption: str(pull(item, ['desc', 'caption', 'title', 'caption.text', 'edge_media_to_caption.edges.0.node.text'])),
      }
    })
    .filter((p): p is ScrapedPost => p !== null)
}

function normalizeAccount(platform: Platform, handle: string, accountRaw: unknown, postsRaw: unknown): ScrapedAccount {
  const followers = num(
    pull(accountRaw, [
      'data.stats.followerCount', 'stats.followerCount', // tiktok-scraper7
      'follower_count', 'data.follower_count',
      'edge_followed_by.count', 'user.edge_followed_by.count', 'data.user.edge_followed_by.count',
      'result.user.edge_followed_by.count', 'graphql.user.edge_followed_by.count', // IG variants
      'usersCount', 'data.usersCount', 'followers',
    ]),
  )
  if (followers === null) {
    throw new ScraperError('Data akun nggak kebaca — kemungkinan akun privat, nggak ada, atau format response provider berbeda.')
  }
  return {
    platform,
    handle,
    displayName: str(pull(accountRaw, ['data.user.nickname', 'user.nickname', 'nickname', 'full_name', 'data.full_name', 'data.user.full_name', 'result.user.full_name', 'user.full_name', 'name', 'screenName'])),
    bio: str(pull(accountRaw, ['data.user.signature', 'user.signature', 'signature', 'biography', 'data.biography', 'data.user.biography', 'result.user.biography', 'user.biography', 'description'])),
    followers,
    following: num(pull(accountRaw, ['data.stats.followingCount', 'following_count', 'edge_follow.count', 'user.edge_follow.count'])),
    totalPosts: num(pull(accountRaw, ['data.stats.videoCount', 'media_count', 'edge_owner_to_timeline_media.count', 'data.user.edge_owner_to_timeline_media.count', 'result.user.edge_owner_to_timeline_media.count', 'aweme_count'])),
    verified: truthy(pull(accountRaw, ['data.user.verified', 'is_verified', 'verified', 'data.user.is_verified', 'user.is_verified', 'result.user.is_verified'])),
    avatarUrl: str(pull(accountRaw, ['data.user.avatarLarger', 'profile_pic_url_hd', 'profile_pic_url', 'avatar_url', 'data.user.profile_pic_url', 'result.user.profile_pic_url', 'hd_profile_pic_url_info.url', 'image'])),
    recentPosts: normalizePosts(postsRaw),
    scrapedAt: new Date().toISOString(),
    provider: 'rapidapi',
  }
}

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
  return normalizeAccount('tiktok', handle, info, posts)
}

// instagram120: raw posts (2 calls). Kept as a fallback — rate-limits fast on the free tier.
async function scrapeInstagram120(handle: string): Promise<ScrapedAccount> {
  const [info, posts] = await Promise.all([
    rapidFetch(IG_HOST, '/api/instagram/userInfo', { method: 'POST', body: JSON.stringify({ username: handle }) }),
    rapidFetch(IG_HOST, '/api/instagram/posts', { method: 'POST', body: JSON.stringify({ username: handle, maxId: '' }) }),
  ])
  return normalizeAccount('instagram', handle, info, posts)
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
