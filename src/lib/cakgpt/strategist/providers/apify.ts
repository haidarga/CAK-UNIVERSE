// Apify adapter for Strategist Mode — Instagram only, paid, last in the chain.
//
// Kept behind the same ScraperProvider interface as the others so the failover
// logic does not special-case it. TikTok is not offered here: Zapi covers it,
// and a paid per-result actor is not the place to add a platform the free
// providers already handle.
import type { Platform, ScrapedAccount, ScrapedPost, ScraperProvider } from '@/lib/cakgpt/strategist/types'
import { ScraperError } from '@/lib/cakgpt/strategist/errors'
import { fetchApifyInstagramProfile, ApifyError, type ApifyIgPost } from '@/lib/integrations/scrapers/apify'

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function mapPost(p: ApifyIgPost): ScrapedPost {
  // "Video" / productType "clips" (Reels) both mean video. A view count is the
  // fallback tell for anything unlabelled.
  const views = num(p.videoViewCount)
  const isVideo =
    p.type === 'Video' || p.productType === 'clips' || !!p.videoUrl
      ? true
      : p.type === 'Image' || p.type === 'Sidecar'
        ? false
        : views === null ? null : views > 0

  return {
    id: p.shortCode || p.id || null,
    views,
    likes: num(p.likesCount),
    comments: num(p.commentsCount),
    shares: null,
    saves: null,
    isVideo,
    takenAt: p.timestamp || null,
    caption: p.caption?.slice(0, 300) || null,
  }
}

async function scrape(platform: Platform, handle: string): Promise<ScrapedAccount> {
  if (platform !== 'instagram') {
    throw new ScraperError('Apify adapter cuma buat Instagram.')
  }

  let profile
  try {
    profile = await fetchApifyInstagramProfile(handle)
  } catch (e) {
    if (e instanceof ApifyError) {
      if (e.status === 401 || e.status === 403) throw new ScraperError('Apify nolak request — cek APIFY_TOKEN.')
      if (e.status === 402) throw new ScraperError('Kredit Apify habis.')
      throw new ScraperError(`Apify error (${e.status}).`)
    }
    throw new ScraperError(e instanceof Error ? e.message : 'Apify request gagal.')
  }

  if (!profile) throw new ScraperError(`Akun @${handle} nggak ketemu di Apify.`)
  if (profile.private) throw new ScraperError(`Akun @${handle} private — nggak ada data publik.`)

  const followers = num(profile.followersCount)
  if (followers === null) {
    throw new ScraperError('Apify balikin data tanpa jumlah follower.')
  }

  return {
    platform: 'instagram',
    handle,
    displayName: profile.fullName || null,
    bio: profile.biography || null,
    followers,
    following: num(profile.followsCount),
    totalPosts: num(profile.postsCount),
    verified: !!profile.verified,
    avatarUrl: profile.profilePicUrlHD || profile.profilePicUrl || null,
    recentPosts: (profile.latestPosts || []).map(mapPost).filter((p) => p.likes !== null || p.comments !== null),
    scrapedAt: new Date().toISOString(),
    provider: 'apify',
  }
}

export const apifyProvider: ScraperProvider = { name: 'apify', scrape }
