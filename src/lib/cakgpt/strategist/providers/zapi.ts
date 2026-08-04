// Zapi scraper adapter for Strategist Mode.
//
// A clean fit: Strategist only ever needs profile + recent posts for a KNOWN
// handle, and that is exactly the shape both Zapi scrapers expose.
//
//   TikTok    → GET /v1/social-media:tiktok-scraper/profile/{username}
//               GET /v1/social-media:tiktok-scraper/posts/{username}?count=
//   Instagram → GET /v1/social-media:instagram-scraper/profile/{username}
//               GET /v1/social-media:instagram-scraper/posts/{username}?page=
//
// Notably this removes Instagram's dependency on a logged-in session: the
// RapidAPI path needed two different IG vendors (statistics + instagram120) and
// the Trend Radar path needs real IG credentials. Here one key covers both
// platforms with the same response contract.
import type { Platform, ScrapedAccount, ScraperProvider } from '@/lib/cakgpt/strategist/types'
import { ScraperError } from '@/lib/cakgpt/strategist/errors'
import { normalizeAccount } from '@/lib/cakgpt/strategist/providers/normalize'
import {
  ZapiError,
  fetchTikTokProfile,
  fetchTikTokPosts,
  fetchInstagramProfile,
  fetchInstagramPosts,
  normalizeHandle,
} from '@/lib/integrations/scrapers/zapi'

// Matches the RapidAPI adapter's pool size so the downstream 7/15/30 sample
// selector behaves identically no matter which provider produced the cache.
const POST_COUNT = 30

// Zapi's typed errors carry the detail; ScraperError is what the Strategist UI
// knows how to display, so translate rather than leak a raw HTTP message.
function toScraperError(e: unknown, platform: Platform): ScraperError {
  if (e instanceof ZapiError) {
    const ref = e.requestId ? ` (ref: ${e.requestId})` : ''
    if (e.status === 401) return new ScraperError(`Zapi nolak request — cek ZAPI_KEY${ref}.`)
    if (e.status === 403) return new ScraperError(`Plan Zapi lu gak nyakup endpoint ini${ref}.`)
    if (e.status === 404) return new ScraperError(`Akun ${platform} gak ketemu di Zapi — cek handle-nya${ref}.`)
    if (e.status === 429) {
      const wait = e.retryAfterSec ? ` Coba lagi ${e.retryAfterSec} detik.` : ''
      return new ScraperError(`Kuota Zapi kena rate limit.${wait}${ref}`)
    }
    if (e.status === 408) return new ScraperError(`Zapi kelamaan gak jawab${ref}.`)
    return new ScraperError(`Zapi error (${e.status})${ref}.`)
  }
  return new ScraperError(e instanceof Error ? e.message : 'Zapi request gagal.')
}

async function scrape(platform: Platform, rawHandle: string): Promise<ScrapedAccount> {
  const handle = normalizeHandle(rawHandle)
  if (!handle) throw new ScraperError('Handle kosong.')

  try {
    // Posts are best-effort: a private or brand-new account still yields a
    // usable profile, and returning followers with an empty post list beats
    // failing the whole report. normalizeAccount already treats missing posts
    // as "unknown" rather than zero.
    const [profile, posts] = await Promise.all([
      platform === 'tiktok' ? fetchTikTokProfile(handle) : fetchInstagramProfile(handle),
      (platform === 'tiktok' ? fetchTikTokPosts(handle, POST_COUNT) : fetchInstagramPosts(handle)).catch(() => null),
    ])
    return normalizeAccount(platform, handle, profile, posts, 'zapi')
  } catch (e) {
    if (e instanceof ScraperError) throw e
    throw toScraperError(e, platform)
  }
}

export const zapiProvider: ScraperProvider = {
  name: 'zapi',
  scrape,
}
