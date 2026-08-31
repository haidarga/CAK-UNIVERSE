import {
  searchTikTokUsers,
  normalizeHandle,
  type ZapiTikTokSearchUser,
} from '@/lib/integrations/scrapers/zapi'
import type { KolProfile } from '@/lib/kol/types'

// Stage 2 — resolve a bare handle into measured stats.
//
// Hashtag and video search hand back an author stub with nothing but a username,
// nickname and avatar. Follower count lives one call away.
//
// That call is search-users, NOT profile, even though profile also carries the
// number and both agree to within real-time drift (89.186 vs 89.174 on the same
// account, seconds apart). search-users wins because one response also brings
// region, bio, verified and a linked Instagram handle — everything the tier and
// country filters need, in a single round trip.
//
// Resolution rate measured on a real cohort: 61 of 61.

const RESOLVE_CONCURRENCY = 8

export function profileFromSearchUser(user: ZapiTikTokSearchUser): KolProfile {
  const handle = normalizeHandle(user.username || '')
  return {
    handle,
    displayName: user.nickname || null,
    bio: user.signature || null,
    // Nullable rather than 0: an unread field and a genuinely empty account mean
    // opposite things, and only one of them should ever reach a tier bucket.
    followers: typeof user.followerCount === 'number' ? user.followerCount : null,
    following: typeof user.followingCount === 'number' ? user.followingCount : null,
    totalVideos: typeof user.videoCount === 'number' ? user.videoCount : null,
    totalHearts: typeof user.heartCount === 'number' ? user.heartCount : null,
    country: user.region || null,
    verified: !!user.verified,
    isPrivate: !!user.privateAccount,
    avatarUrl: null,
    instagramHandle: user.instagramId || null,
    profileUrl: user.url || `https://www.tiktok.com/@${handle}`,
  }
}

/** Runs `fn` over `items` with a fixed number in flight. Order of results matches input. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * Looks a handle up by exact username via keyword search.
 *
 * The endpoint is a fuzzy search, so a match is only accepted on an exact
 * case-insensitive username hit. Taking the top-ranked row instead would
 * silently attribute a lookalike account's follower count to the creator we
 * were actually asked about.
 */
export async function resolveHandle(handle: string): Promise<KolProfile | null> {
  const clean = normalizeHandle(handle)
  if (!clean) return null
  try {
    const page = await searchTikTokUsers(clean)
    const hit = (page.users || []).find((u) => normalizeHandle(u.username || '') === clean)
    return hit ? profileFromSearchUser(hit) : null
  } catch {
    // A single failed lookup drops one candidate; it must not abort the sweep.
    return null
  }
}

export interface ResolveOutcome {
  profiles: Map<string, KolProfile>
  /** Handles the provider could not return stats for. Surfaced, not swallowed. */
  unresolved: string[]
}

export async function resolveHandles(
  handles: string[],
  preResolved: Map<string, ZapiTikTokSearchUser>,
  cached: Map<string, KolProfile> = new Map(),
): Promise<ResolveOutcome> {
  const profiles = new Map<string, KolProfile>()
  const needsLookup: string[] = []

  for (const handle of handles) {
    const fromCache = cached.get(handle)
    if (fromCache) {
      profiles.set(handle, fromCache)
      continue
    }
    // search-users discovery already paid for these rows — re-fetching would be
    // a second call for an answer we are holding.
    const pre = preResolved.get(handle)
    if (pre) {
      profiles.set(handle, profileFromSearchUser(pre))
      continue
    }
    needsLookup.push(handle)
  }

  const looked = await mapWithConcurrency(needsLookup, RESOLVE_CONCURRENCY, (h) => resolveHandle(h))
  const unresolved: string[] = []
  looked.forEach((profile, i) => {
    if (profile) profiles.set(needsLookup[i], profile)
    else unresolved.push(needsLookup[i])
  })

  return { profiles, unresolved }
}
