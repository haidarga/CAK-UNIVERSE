import type { Platform, ScrapedAccount, ScraperProvider } from '@/lib/cakgpt/strategist/types'
import { ScraperError } from '@/lib/cakgpt/strategist/errors'
import { rapidApiProvider } from '@/lib/cakgpt/strategist/providers/rapidapi'

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

function selectProvider(): ScraperProvider {
  const choice = (process.env.STRATEGIST_SCRAPER || 'rapidapi').toLowerCase()
  if (choice === 'mock') return mockProvider
  if (choice === 'rapidapi') return rapidApiProvider
  throw new ScraperError(`Unknown STRATEGIST_SCRAPER: "${choice}" (expected "rapidapi" or "mock")`)
}

export async function scrapeAccount(platform: Platform, handle: string): Promise<ScrapedAccount> {
  const provider = selectProvider()
  const account = await provider.scrape(platform, handle)
  if (!account.recentPosts || account.recentPosts.length === 0) {
    throw new ScraperError('Akun ditemukan tapi nggak ada post publik yang bisa dianalisis.')
  }
  return account
}
