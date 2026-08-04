// Zapi (api.zpi.web.id) — social data provider.
//
// Contract (from the Zapi docs):
//   GET https://api.zpi.web.id/v1/{category}:{service}/{operation}/{pathParam}
//   Header: x-api-key: zpi_...
//   Extra params: query string on GET.
//   Errors: 401 auth · 403 plan gate · 404 · 422 invalid params · 429 (+retryAfterSec)
//   Every response carries x-request-id, which is what support will ask for.
//
// WHAT THIS CAN AND CANNOT DO — both scrapers are ACCOUNT-based:
//   tiktok-scraper    : profile, posts, post, comments, following
//   instagram-scraper : profile, posts, post, comments, stories
// There is NO keyword/hashtag search on either, and nothing in Zapi's Search
// Tools category covers social platforms. So Zapi fully replaces the Strategist
// Mode provider (which only ever needs profile + posts for a known handle), but
// it CANNOT power Trend Radar's discovery, which is keyword/hashtag driven.
// Trend Radar therefore keeps its existing discovery and uses Zapi only to
// enrich the items it already found.

const BASE_URL = process.env.ZAPI_BASE_URL || 'https://api.zpi.web.id/v1'
const TIKTOK_SERVICE = 'social-media:tiktok-scraper'
const INSTAGRAM_SERVICE = 'social-media:instagram-scraper'

const DEFAULT_TIMEOUT_MS = 20_000

export function zapiConfigured(): boolean {
  return !!process.env.ZAPI_KEY
}

export class ZapiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string,
    // Present on 429 so the caller can honour the server's own backoff instead
    // of inventing one.
    readonly retryAfterSec?: number,
  ) {
    super(message)
    this.name = 'ZapiError'
  }
}

// Handles arrive as "@name", a bare name, or a full profile URL depending on
// where the writer pasted them from. Zapi documents that it accepts all three,
// but normalising here keeps cache keys stable — otherwise "@acekid" and
// "acekid" would scrape twice and cache twice.
export function normalizeHandle(raw: string): string {
  const trimmed = (raw || '').trim()
  if (!trimmed) return ''
  const fromUrl = trimmed.match(/(?:tiktok\.com|instagram\.com)\/@?([A-Za-z0-9._-]+)/i)
  if (fromUrl) return fromUrl[1].toLowerCase()
  return trimmed.replace(/^@/, '').split(/[/?#]/)[0].toLowerCase()
}

// The live REST API wraps every success in { project, data, timestamp } — the
// docs' "Example response" shows the INNER object, so following the docs alone
// produces a normalizer that reads nothing. Unwrapping once here means every
// caller sees the flat payload the docs describe, and the candidate-path lists
// stay free of a `data.` prefix on every single entry.
//
// Guarded rather than assumed: anything that is not that exact envelope is
// passed straight through, so a future endpoint returning a bare object or a
// bare array still works.
function unwrapEnvelope(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body
  const o = body as Record<string, unknown>
  if ('data' in o && 'project' in o && 'timestamp' in o) return o.data
  return body
}

export function buildZapiUrl(service: string, operation: string, pathParam?: string, query?: Record<string, string | number | undefined>): string {
  const segments = [BASE_URL, service, operation]
  if (pathParam) segments.push(encodeURIComponent(pathParam))
  const url = new URL(segments.join('/'))
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function zapiGet<T = unknown>(
  service: string,
  operation: string,
  pathParam?: string,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const key = process.env.ZAPI_KEY
  if (!key) throw new ZapiError('ZAPI_KEY is not set', 0)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch(buildZapiUrl(service, operation, pathParam, query), {
      headers: { 'x-api-key': key, accept: 'application/json' },
      signal: controller.signal,
    })
    const requestId = res.headers.get('x-request-id') || undefined

    if (!res.ok) {
      // Body is best-effort: a gateway error may not be JSON at all, and losing
      // the status code to a parse throw would hide why the call failed.
      const body = await res.json().catch(() => null) as { message?: string; error?: string; retryAfterSec?: number } | null
      const retryAfterSec = body?.retryAfterSec
        ?? (res.headers.get('retry-after') ? Number(res.headers.get('retry-after')) : undefined)
      throw new ZapiError(
        body?.message || body?.error || `Zapi ${operation} failed (HTTP ${res.status})`,
        res.status,
        requestId,
        Number.isFinite(retryAfterSec) ? retryAfterSec : undefined,
      )
    }
    return unwrapEnvelope(await res.json()) as T
  } catch (e) {
    if (e instanceof ZapiError) throw e
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ZapiError(`Zapi ${operation} timed out after ${DEFAULT_TIMEOUT_MS}ms`, 408)
    }
    throw new ZapiError(e instanceof Error ? e.message : 'Zapi request failed', 0)
  } finally {
    clearTimeout(timer)
  }
}

// ── TikTok ──────────────────────────────────────────────────────────────────

export type ZapiTikTokProfile = {
  url?: string
  userId?: string
  nickname?: string
  username?: string
  verified?: boolean
  signature?: string
  heartCount?: number
  videoCount?: number
  followerCount?: number
  followingCount?: number
  avatarLarger?: string
  avatarMedium?: string
  privateAccount?: boolean
}

export function fetchTikTokProfile(handle: string): Promise<ZapiTikTokProfile> {
  return zapiGet<ZapiTikTokProfile>(TIKTOK_SERVICE, 'profile', normalizeHandle(handle))
}

export function fetchTikTokPosts(handle: string, count = 30): Promise<unknown> {
  return zapiGet(TIKTOK_SERVICE, 'posts', normalizeHandle(handle), { count })
}

export function fetchTikTokPost(idOrUrl: string): Promise<unknown> {
  return zapiGet(TIKTOK_SERVICE, 'post', idOrUrl)
}

// ── Instagram ───────────────────────────────────────────────────────────────

export function fetchInstagramProfile(handle: string): Promise<unknown> {
  return zapiGet(INSTAGRAM_SERVICE, 'profile', normalizeHandle(handle))
}

export function fetchInstagramPosts(handle: string, page = 1): Promise<unknown> {
  return zapiGet(INSTAGRAM_SERVICE, 'posts', normalizeHandle(handle), { page })
}

export function fetchInstagramPost(idOrUrl: string): Promise<unknown> {
  return zapiGet(INSTAGRAM_SERVICE, 'post', idOrUrl)
}

// ── Trend Radar enrichment ──────────────────────────────────────────────────
//
// Zapi cannot DISCOVER posts (no keyword/hashtag endpoint on either scraper),
// so Trend Radar keeps its existing discovery. What Zapi can do is fix the
// NUMBERS: the Instagram path scrapes view/like counts out of the rendered DOM
// as strings ("1.2M", "12rb", or nothing at all), and Trend Radar ranks by
// views — so a missed parse silently pushes a strong post to the bottom.
// post/:id returns those as structured integers.

const ENRICH_CONCURRENCY = 5

export type EnrichableItem = { url: string; views?: number | null; likes?: number | null }

function extractShortcode(url: string): string | null {
  // /p/<code>/ for feed posts, /reel/<code>/ or /reels/<code>/ for reels.
  return url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i)?.[1] ?? null
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

/**
 * Fills in missing view/like counts on Instagram trend items.
 *
 * Best-effort by design: this runs on the hot path of a Trend Radar search, so
 * any failure (no key, rate limit, unparseable URL) leaves the item exactly as
 * discovery produced it rather than failing the search. Items that already have
 * both numbers are skipped, so a good scrape costs no quota at all.
 */
export async function enrichInstagramItems<T extends EnrichableItem>(items: T[]): Promise<T[]> {
  if (!zapiConfigured() || items.length === 0) return items

  const needsWork = items.some((it) => it.views == null || it.likes == null)
  if (!needsWork) return items

  return mapWithConcurrency(items, ENRICH_CONCURRENCY, async (item) => {
    if (item.views != null && item.likes != null) return item
    const code = extractShortcode(item.url)
    if (!code) return item
    try {
      const raw = await fetchInstagramPost(code) as Record<string, unknown>
      const views = pickNumber(raw, ['playCount', 'play_count', 'videoViewCount', 'video_view_count', 'viewCount', 'views'])
      const likes = pickNumber(raw, ['likeCount', 'like_count', 'likes', 'edge_liked_by'])
      return {
        ...item,
        views: item.views ?? views,
        likes: item.likes ?? likes,
      }
    } catch {
      return item
    }
  })
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj?.[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && Number.isFinite(Number(v))) return Number(v)
    // Some shapes nest the count one level down as { count: n }.
    if (v && typeof v === 'object' && typeof (v as { count?: unknown }).count === 'number') {
      return (v as { count: number }).count
    }
  }
  return null
}
