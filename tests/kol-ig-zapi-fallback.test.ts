import { describe, it, expect, vi, beforeEach } from 'vitest'

const apifyProfiles = vi.fn()
const zapiProfile = vi.fn()
const zapiPosts = vi.fn()

vi.mock('@/lib/integrations/scrapers/apify', () => ({
  apifyConfigured: () => true,
  fetchApifyInstagramHashtag: vi.fn(),
  fetchApifyInstagramProfiles: (...a: unknown[]) => apifyProfiles(...a),
  ApifyError: class extends Error {},
}))
vi.mock('@/lib/integrations/scrapers/zapi', () => ({
  zapiConfigured: () => true,
  fetchInstagramProfile: (...a: unknown[]) => zapiProfile(...a),
  fetchInstagramPosts: (...a: unknown[]) => zapiPosts(...a),
}))

import { resolveAndEnrichInstagram, zapiToIgProfile } from '@/lib/kol/instagram'

const zapiProfileRaw = { username: 'hardi', fullName: 'Hardi', followerCount: 48100, followingCount: 1554, postCount: null }
const zapiPostsRaw = {
  posts: [
    { shortcode: 'a', type: 'video', productType: 'clips', viewCount: 8000, likeCount: 200, commentCount: 10, takenAtIso: '2026-10-19T09:00:00.000Z' },
    { shortcode: 'b', type: 'video', productType: 'clips', viewCount: 2000, likeCount: 50, commentCount: 4, takenAtIso: '2026-10-17T09:00:00.000Z' },
    { shortcode: 'c', type: 'image', likeCount: 30, commentCount: 1, takenAtIso: '2026-10-15T09:00:00.000Z' },
  ],
}

beforeEach(() => {
  apifyProfiles.mockReset()
  zapiProfile.mockReset()
  zapiPosts.mockReset()
})

describe('zapiToIgProfile', () => {
  it('maps followers and video views into the Apify shape', () => {
    const p = zapiToIgProfile('hardi', zapiProfileRaw, zapiPostsRaw)
    expect(p?.followersCount).toBe(48100)
    expect(p?.latestPosts?.filter((x) => x.type === 'Video')).toHaveLength(2)
    expect(p?.latestPosts?.[0].videoViewCount).toBe(8000)
  })

  it('returns null when neither profile nor posts are readable', () => {
    expect(zapiToIgProfile('x', {}, { posts: [] })).toBeNull()
  })
})

describe('resolveAndEnrichInstagram Zapi fallback', () => {
  it('fills in an account Apify was blocked on, with avg views', async () => {
    // Apify's blocked row: no username, no posts.
    apifyProfiles.mockResolvedValue([{ url: 'https://www.instagram.com/hardi/', requestErrorMessages: ['BlockedError'] }])
    zapiProfile.mockResolvedValue(zapiProfileRaw)
    zapiPosts.mockResolvedValue(zapiPostsRaw)

    const out = await resolveAndEnrichInstagram(['hardi'])

    expect(out.unresolved).toEqual([])
    expect(out.profiles.get('hardi')?.followers).toBe(48100)
    expect(out.enriched.get('hardi')?.performance?.avgViews).toBe(5000)
  })

  it('does not call Zapi for accounts Apify already resolved', async () => {
    apifyProfiles.mockResolvedValue([{ username: 'ok', followersCount: 10, latestPosts: [] }])
    const out = await resolveAndEnrichInstagram(['ok'])
    expect(out.unresolved).toEqual([])
    expect(zapiProfile).not.toHaveBeenCalled()
  })

  it('stays unresolved when both providers fail', async () => {
    apifyProfiles.mockRejectedValue(new Error('402'))
    zapiProfile.mockRejectedValue(new Error('503'))
    zapiPosts.mockRejectedValue(new Error('503'))
    const out = await resolveAndEnrichInstagram(['ghost'])
    expect(out.unresolved).toEqual(['ghost'])
  })
})
