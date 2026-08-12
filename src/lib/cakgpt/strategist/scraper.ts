import type { Platform, ScrapedAccount, ScraperProvider } from '@/lib/cakgpt/strategist/types'
import { ScraperError } from '@/lib/cakgpt/strategist/errors'
import { rapidApiProvider } from '@/lib/cakgpt/strategist/providers/rapidapi'
import { zapiProvider } from '@/lib/cakgpt/strategist/providers/zapi'
import { zapiConfigured } from '@/lib/integrations/scrapers/zapi'
import { fetchInstagramPublicCounts } from '@/lib/integrations/scrapers/instagram-public'
import { apifyProvider } from '@/lib/cakgpt/strategist/providers/apify'
import { apifyConfigured } from '@/lib/integrations/scrapers/apify'

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

// Providers to try, in order, when the primary one fails or returns something
// unusable. Never mock — falling back to invented numbers is the one thing
// Strategist Mode must never do.
//
// Ordered by COST, cheapest first. Apify is billed per result, so it only runs
// once every subscription-based source has failed.
export function selectFallbackProviders(primary: ScraperProvider, platform: Platform): ScraperProvider[] {
  const chain: ScraperProvider[] = []
  if (primary.name !== 'zapi' && zapiConfigured()) chain.push(zapiProvider)
  if (primary.name !== 'rapidapi' && process.env.RAPIDAPI_KEY) chain.push(rapidApiProvider)
  // Instagram only — Zapi covers TikTok, and a paid actor is not the place to
  // duplicate a platform the free providers already handle.
  if (primary.name !== 'apify' && platform === 'instagram' && apifyConfigured()) chain.push(apifyProvider)
  return chain
}

/** Back-compat for callers/tests that only care about the first fallback. */
export function selectFallbackProvider(primary: ScraperProvider): ScraperProvider | null {
  return selectFallbackProviders(primary, 'instagram')[0] ?? null
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
export function followersLookBroken(a: ScrapedAccount | null): boolean {
  if (!hasPosts(a)) return false
  if (a.followers === null || a.followers > 0) return false
  // Zero followers is only believable if the posts are also lifeless.
  return a.recentPosts.some((p) => (p.views ?? 0) > 0 || (p.likes ?? 0) > 0 || (p.comments ?? 0) > 0)
}

/**
 * Rewrites an impossible 0 into null.
 *
 * Throwing the whole scrape away over this was wrong: the posts came back
 * complete — real views, likes and comments — and discarding them lost genuinely
 * useful data because ONE field failed. Averages, cadence and the AI estimate
 * all work without a follower count; only the follower-basis engagement ratio
 * needs it, and that falls back to views.
 */
function downgradeBrokenFollowers(a: ScrapedAccount): ScrapedAccount {
  return followersLookBroken(a) ? { ...a, followers: null } : a
}

/** Nothing usable at all — no posts is the only unrecoverable case now. */
export function looksUnreadable(a: ScrapedAccount | null): boolean {
  return !hasPosts(a)
}

export async function scrapeAccount(platform: Platform, handle: string): Promise<ScrapedAccount> {
  const provider = selectProvider()
  const chain = selectFallbackProviders(provider, platform)
  const fallback = chain[0] ?? null

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
  // Walk the chain until one provider returns something clean. Stops at the
  // first good result, so the paid provider at the end is only reached when
  // every cheaper one has genuinely failed.
  for (const alt of chain) {
    if (account && !looksUnreadable(account) && !followersLookBroken(account)) break
    const why = primaryErr
      ? (primaryErr instanceof Error ? primaryErr.message : String(primaryErr))
      : hasPosts(account) ? 'returned 0 followers alongside live posts' : 'returned no posts'
    console.warn(`[strategist] ${provider.name} ${why} — trying ${alt.name}`)
    try {
      const next = await alt.scrape(platform, handle)
      // Only take it if strictly better than what we already hold.
      if (!account || (!looksUnreadable(next) && !followersLookBroken(next))) account = next
    } catch (fallbackErr) {
      console.warn(`[strategist] ${alt.name} also failed:`, fallbackErr instanceof Error ? fallbackErr.message : fallbackErr)
    }
  }
  if (!account && primaryErr) throw primaryErr

  if (!account) throw primaryErr ?? new ScraperError('Gagal ngambil data akun.')

  if (looksUnreadable(account)) {
    throw new ScraperError(
      `Akun ketemu tapi nggak ada post publik yang kebaca.${fallback ? ' Udah dicoba dua provider.' : ''}`,
    )
  }
  if (!followersLookBroken(account)) return account

  // Last resort before giving up on the field: Instagram publishes the count in
  // its own page metadata, which is often readable when the paid providers'
  // profile endpoints are not. Best-effort — a failure just leaves it null.
  if (account.platform === 'instagram') {
    const publicCounts = await fetchInstagramPublicCounts(handle)
    if (publicCounts.followers !== null && publicCounts.followers > 0) {
      console.warn(`[strategist] ${account.provider} could not read followers for @${handle} — filled from Instagram's public page`)
      return {
        ...account,
        followers: publicCounts.followers,
        totalPosts: account.totalPosts && account.totalPosts > 0 ? account.totalPosts : publicCounts.posts,
        provider: `${account.provider}+ig-public`,
      }
    }
  }

  // Keep the scrape, drop only the field that cannot be trusted.
  return downgradeBrokenFollowers(account)
}
