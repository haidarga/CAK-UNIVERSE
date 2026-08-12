import type { Platform, ScrapedAccount, ScraperProvider } from '@/lib/cakgpt/strategist/types'
import { ScraperError } from '@/lib/cakgpt/strategist/errors'
import { rapidApiProvider } from '@/lib/cakgpt/strategist/providers/rapidapi'
import { zapiProvider } from '@/lib/cakgpt/strategist/providers/zapi'
import { zapiConfigured } from '@/lib/integrations/scrapers/zapi'

export { ScraperError }

// Adapter registry + selection. The whole reason scraping is behind a
// ScraperProvider interface is that free-tier providers get rate-limited,
// blocked, or shut down — when one dies we swap the env var, not the code.
//
// Selection (STRATEGIST_SCRAPER env):
//   'rapidapi' (default) → real free-tier scraper, needs RAPIDAPI_KEY.
//   'mock'               → deterministic fake data, no network, no key. Lets you
//                          exercise the full UI/AI/cache flow before wiring a
//                          real provider. Set STRATEGIST_SCRAPER=mock to use it.

// ── Mock provider (dev / demo only) ──────────────────────────────────────────
// Deterministic pseudo-data derived from the handle so the same handle always
// yields the same numbers (cache-friendly, reproducible screenshots). NOT
// random — this is fixture data, not a simulation of real performance.
function seedFromHandle(handle: string): number {
  let h = 0
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) >>> 0
  return h
}

const mockProvider: ScraperProvider = {
  name: 'mock',
  async scrape(platform: Platform, handle: string): Promise<ScrapedAccount> {
    const seed = seedFromHandle(handle)
    const followers = 8_000 + (seed % 120_000)
    const baseViews = platform === 'tiktok' ? Math.round(followers * (0.6 + (seed % 40) / 100)) : null
    const now = Date.now()
    const recentPosts = Array.from({ length: 12 }, (_, i) => {
      const jitter = ((seed >> i) % 40) / 100 + 0.8 // 0.8–1.2x
      const likes = Math.round((baseViews ?? followers) * 0.07 * jitter)
      return {
        id: `${handle}-${i}`,
        views: baseViews ? Math.round(baseViews * jitter) : null,
        likes,
        comments: Math.round(likes * 0.03),
        shares: platform === 'tiktok' ? Math.round(likes * 0.05) : null,
        saves: Math.round(likes * 0.08),
        takenAt: new Date(now - i * 3 * 24 * 60 * 60 * 1000).toISOString(), // ~2/week
        caption: `Konten ${platform} #${i + 1} — contoh caption buat deteksi niche.`,
      }
    })
    return {
      platform,
      handle,
      displayName: handle,
      bio: 'Mock account — set STRATEGIST_SCRAPER=rapidapi + RAPIDAPI_KEY untuk data asli.',
      followers,
      following: 300 + (seed % 900),
      totalPosts: 120 + (seed % 800),
      verified: seed % 5 === 0,
      avatarUrl: null,
      recentPosts,
      scrapedAt: new Date().toISOString(),
      provider: 'mock',
    }
  },
}

export function selectProvider(): ScraperProvider {
  const choice = (process.env.STRATEGIST_SCRAPER || (zapiConfigured() ? 'zapi' : 'rapidapi')).toLowerCase()
  if (choice === 'mock') return mockProvider
  if (choice === 'zapi') return zapiProvider
  if (choice === 'rapidapi') return rapidApiProvider
  throw new ScraperError(`Unknown STRATEGIST_SCRAPER: "${choice}" (expected "zapi", "rapidapi" or "mock")`)
}

// The provider to try when the primary one fails. Only ever a DIFFERENT real
// provider — falling back to mock would silently replace a failed scrape with
// invented numbers, which is the one thing Strategist Mode must never do.
export function selectFallbackProvider(primary: ScraperProvider): ScraperProvider | null {
  if (primary.name === 'zapi' && process.env.RAPIDAPI_KEY) return rapidApiProvider
  if (primary.name === 'rapidapi' && zapiConfigured()) return zapiProvider
  return null
}

function hasPosts(a: ScrapedAccount | null): a is ScrapedAccount {
  return !!a && Array.isArray(a.recentPosts) && a.recentPosts.length > 0
}

/**
 * A scrape that came back "successful" but is internally impossible.
 *
 * Observed live: Zapi's Instagram profile returned HTTP 200 with
 * followerCount 0 and postCount 0 for an account whose POSTS endpoint returned
 * seven posts averaging 7.9k views and 333 likes. Zero followers is a real
 * state for a real account — but not alongside posts pulling thousands of
 * views. That combination means the profile read failed and reported defaults.
 *
 * Left unchecked it renders as "Followers 0 · Engagement 0%" under a green
 * DATA AKTUAL header: a confidently wrong number where the whole point of the
 * section is that it was measured.
 */
export function looksUnreadable(a: ScrapedAccount | null): boolean {
  if (!hasPosts(a)) return true
  if (a.followers > 0) return false
  // Zero followers is only believable if the posts are also lifeless.
  return a.recentPosts.some((p) => (p.views ?? 0) > 0 || (p.likes ?? 0) > 0 || (p.comments ?? 0) > 0)
}

export async function scrapeAccount(platform: Platform, handle: string): Promise<ScrapedAccount> {
  const provider = selectProvider()
  const fallback = selectFallbackProvider(provider)

  let account: ScrapedAccount | null = null
  let primaryErr: unknown = null
  try {
    account = await provider.scrape(platform, handle)
  } catch (e) {
    primaryErr = e
  }

  // Failover covers BOTH an outright failure and a scrape that came back with
  // followers but no posts. The second case used to be treated as "this account
  // has nothing public" and reported as such — but it is just as often one
  // provider's post endpoint failing while the other returns a full feed
  // (observed live: RapidAPI's IG statistics returned zero posts for an account
  // Zapi returned twelve for). Reporting that as an empty account sent the
  // writer chasing a problem that was never on Instagram's side.
  if (fallback && looksUnreadable(account)) {
    const why = primaryErr
      ? (primaryErr instanceof Error ? primaryErr.message : String(primaryErr))
      : hasPosts(account) ? 'returned 0 followers alongside live posts' : 'returned no posts'
    console.warn(`[strategist] ${provider.name} ${why} — retrying on ${fallback.name}`)
    try {
      const alt = await fallback.scrape(platform, handle)
      if (!looksUnreadable(alt) || !account) account = alt
    } catch (fallbackErr) {
      // Both failed: surface the PRIMARY error, which is the one the operator
      // can act on (its key/quota is the configured default).
      if (!account) throw primaryErr ?? fallbackErr
    }
  }

  if (!account) throw primaryErr ?? new ScraperError('Gagal ngambil data akun.')

  if (looksUnreadable(account)) {
    // Two distinct failures, two distinct messages — "no posts" and "profile
    // came back empty while posts did not" need different next steps.
    const suffix = fallback
      ? ' Udah dicoba dua provider.'
      : ' Set ZAPI_KEY (atau RAPIDAPI_KEY) biar ada provider cadangan.'
    throw new ScraperError(
      hasPosts(account)
        ? `Data profil ${handle} nggak kebaca — follower kebaca 0 padahal postingannya jelas ada engagement. Itu scrape yang gagal separuh di sisi provider, bukan kondisi akunnya.${suffix}`
        : `Akun ketemu tapi nggak ada post publik yang kebaca.${suffix}`,
    )
  }
  return account
}
