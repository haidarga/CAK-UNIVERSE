import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildZapiUrl, normalizeHandle, ZapiError, fetchTikTokProfile } from '@/lib/integrations/scrapers/zapi'
import { normalizeAccount, normalizePosts } from '@/lib/cakgpt/strategist/providers/normalize'

// The real payload Zapi returns for
// GET /v1/social-media:tiktok-scraper/profile/mrbeast — kept verbatim so a
// change in their field names fails here instead of silently producing an
// account with 0 followers.
const REAL_TIKTOK_PROFILE = {
  ftc: false,
  url: 'https://www.tiktok.com/@mrbeast',
  secUid: 'MS4wLjABAAAABKjQkOz_IIzXXzEAl_9LGsWhvK-gBnlczwRPXK8EmxAp6K3X0qiaP5_OEqmm0XwG',
  secret: false,
  userId: '6614519312189947909',
  nickname: 'MrBeast',
  username: 'mrbeast',
  verified: true,
  diggCount: 0,
  signature: 'Checkout My New Book!',
  createTime: 1540063576,
  heartCount: 1318098041,
  shareTitle: 'MrBeast on TikTok',
  videoCount: 462,
  avatarThumb: 'https://p16.example/thumb.webp',
  isADVirtual: false,
  avatarLarger: 'https://p19.example/larger.webp',
  avatarMedium: 'https://p19.example/medium.webp',
  isUnderAge18: false,
  openFavorite: false,
  followerCount: 129273832,
  followingCount: 353,
  privateAccount: false,
  shareDescription: 'Checkout My New Book!',
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('normalizeHandle', () => {
  it('strips a leading @', () => {
    expect(normalizeHandle('@AceKid')).toBe('acekid')
  })

  it('pulls the handle out of a full profile URL', () => {
    expect(normalizeHandle('https://www.tiktok.com/@mrbeast')).toBe('mrbeast')
    expect(normalizeHandle('https://www.instagram.com/acekid/')).toBe('acekid')
  })

  it('drops a trailing path or query', () => {
    expect(normalizeHandle('acekid/?hl=id')).toBe('acekid')
  })

  it('is empty for empty input', () => {
    expect(normalizeHandle('')).toBe('')
    expect(normalizeHandle('   ')).toBe('')
  })

  it('normalizes case so the same account is not scraped and cached twice', () => {
    expect(normalizeHandle('@AceKid')).toBe(normalizeHandle('acekid'))
  })
})

describe('buildZapiUrl', () => {
  it('builds the documented path shape', () => {
    expect(buildZapiUrl('social-media:tiktok-scraper', 'profile', 'mrbeast'))
      .toBe('https://api.zpi.web.id/v1/social-media:tiktok-scraper/profile/mrbeast')
  })

  it('appends query params on GET', () => {
    const url = buildZapiUrl('social-media:tiktok-scraper', 'posts', 'mrbeast', { count: 30 })
    expect(url).toContain('/posts/mrbeast')
    expect(url).toContain('count=30')
  })

  it('omits empty params instead of sending blanks', () => {
    const url = buildZapiUrl('social-media:instagram-scraper', 'posts', 'acekid', { page: undefined })
    expect(url).not.toContain('page=')
  })

  it('escapes a handle that would otherwise break the path', () => {
    expect(buildZapiUrl('s:x', 'profile', 'a/b')).toContain('a%2Fb')
  })
})

describe('zapi error mapping', () => {
  function stubFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
    vi.stubEnv('ZAPI_KEY', 'zpi_test')
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
      json: async () => body,
    })))
  }

  it('throws a typed error carrying the status and request id', async () => {
    stubFetch(404, { message: 'not found' }, { 'x-request-id': 'req_123' })
    await expect(fetchTikTokProfile('ghost')).rejects.toMatchObject({
      name: 'ZapiError', status: 404, requestId: 'req_123',
    })
  })

  it('surfaces the server-provided retry delay on 429', async () => {
    stubFetch(429, { message: 'rate limited', retryAfterSec: 12 })
    await expect(fetchTikTokProfile('x')).rejects.toMatchObject({ status: 429, retryAfterSec: 12 })
  })

  it('falls back to the Retry-After header when the body omits it', async () => {
    stubFetch(429, {}, { 'retry-after': '7' })
    await expect(fetchTikTokProfile('x')).rejects.toMatchObject({ status: 429, retryAfterSec: 7 })
  })

  it('does not lose the status when the error body is not JSON', async () => {
    vi.stubEnv('ZAPI_KEY', 'zpi_test')
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 502,
      headers: { get: () => null },
      json: async () => { throw new Error('not json') },
    })))
    await expect(fetchTikTokProfile('x')).rejects.toMatchObject({ status: 502 })
  })

  it('fails clearly when the key is missing rather than calling out', async () => {
    vi.stubEnv('ZAPI_KEY', '')
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    await expect(fetchTikTokProfile('x')).rejects.toBeInstanceOf(ZapiError)
    expect(spy).not.toHaveBeenCalled()
  })

  it('sends the key as x-api-key on a successful call', async () => {
    vi.stubEnv('ZAPI_KEY', 'zpi_test')
    const spy = vi.fn(async () => ({
      ok: true, status: 200, headers: { get: () => null }, json: async () => REAL_TIKTOK_PROFILE,
    }))
    vi.stubGlobal('fetch', spy)
    await fetchTikTokProfile('@MrBeast')
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/profile/mrbeast') // handle normalized before the call
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('zpi_test')
  })
})

describe('normalizeAccount with a real Zapi TikTok profile', () => {
  it('reads the flat camelCase fields Zapi returns', () => {
    const acc = normalizeAccount('tiktok', 'mrbeast', REAL_TIKTOK_PROFILE, [], 'zapi')
    expect(acc.followers).toBe(129273832)
    expect(acc.displayName).toBe('MrBeast')
    expect(acc.totalPosts).toBe(462)
    expect(acc.following).toBe(353)
    expect(acc.verified).toBe(true)
    expect(acc.avatarUrl).toContain('larger')
    expect(acc.provider).toBe('zapi')
  })

  it('still reads the nested RapidAPI shape, so one normalizer serves both', () => {
    const acc = normalizeAccount('tiktok', 'x', { data: { stats: { followerCount: 500 } } }, [], 'rapidapi')
    expect(acc.followers).toBe(500)
  })

  it('throws rather than reporting 0 followers when the shape is unrecognised', () => {
    // A silent 0 would flow into engagement-rate math and produce confident
    // nonsense in a report labelled "Data Aktual".
    expect(() => normalizeAccount('tiktok', 'x', { unexpected: true }, [], 'zapi')).toThrow()
  })
})

describe('normalizePosts across provider shapes', () => {
  it('accepts a bare top-level array (Zapi)', () => {
    const posts = normalizePosts([
      { videoId: '1', playCount: 1000, diggCount: 50, commentCount: 4, createTime: 1740000000, desc: 'halo' },
    ])
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ id: '1', views: 1000, likes: 50, comments: 4 })
    expect(posts[0].takenAt).toMatch(/^\d{4}-/)
  })

  it('still accepts the wrapped RapidAPI shape', () => {
    const posts = normalizePosts({ data: { videos: [{ video_id: '9', play_count: 7, digg_count: 2, comment_count: 1 }] } })
    expect(posts).toHaveLength(1)
    expect(posts[0].views).toBe(7)
  })

  it('drops an entry with no engagement signal at all', () => {
    // likes and comments both unknown means the row tells us nothing; keeping it
    // would dilute the averages with a phantom post.
    expect(normalizePosts([{ videoId: 'x', playCount: 10 }])).toHaveLength(0)
  })

  it('returns an empty list for junk instead of throwing', () => {
    expect(normalizePosts(null)).toEqual([])
    expect(normalizePosts({ nope: 1 })).toEqual([])
  })
})

// ── Provider selection + automatic failover ─────────────────────────────────
import { selectProvider, selectFallbackProvider } from '@/lib/cakgpt/strategist/scraper'

describe('provider selection', () => {
  it('prefers Zapi once a key is configured', () => {
    vi.stubEnv('ZAPI_KEY', 'zpi_test')
    vi.stubEnv('STRATEGIST_SCRAPER', '')
    expect(selectProvider().name).toBe('zapi')
  })

  it('keeps the old RapidAPI default when Zapi is not configured', () => {
    vi.stubEnv('ZAPI_KEY', '')
    vi.stubEnv('STRATEGIST_SCRAPER', '')
    expect(selectProvider().name).toBe('rapidapi')
  })

  it('honours an explicit override in both directions', () => {
    vi.stubEnv('ZAPI_KEY', 'zpi_test')
    vi.stubEnv('STRATEGIST_SCRAPER', 'rapidapi')
    expect(selectProvider().name).toBe('rapidapi')
    vi.stubEnv('STRATEGIST_SCRAPER', 'zapi')
    expect(selectProvider().name).toBe('zapi')
  })

  it('rejects an unknown provider name loudly', () => {
    vi.stubEnv('STRATEGIST_SCRAPER', 'wat')
    expect(() => selectProvider()).toThrow(/wat/)
  })
})

describe('failover', () => {
  it('falls back Zapi -> RapidAPI when a RapidAPI key exists', () => {
    vi.stubEnv('RAPIDAPI_KEY', 'rapid_test')
    expect(selectFallbackProvider({ name: 'zapi' } as never)?.name).toBe('rapidapi')
  })

  it('falls back RapidAPI -> Zapi in the other direction', () => {
    vi.stubEnv('ZAPI_KEY', 'zpi_test')
    expect(selectFallbackProvider({ name: 'rapidapi' } as never)?.name).toBe('zapi')
  })

  it('has no fallback when only one provider is configured', () => {
    vi.stubEnv('RAPIDAPI_KEY', '')
    expect(selectFallbackProvider({ name: 'zapi' } as never)).toBeNull()
  })

  it('NEVER falls back to mock', () => {
    // Mock data in a report labelled "Data Aktual" would be a fabricated number
    // presented as measured — the one failure mode this feature must not have.
    vi.stubEnv('RAPIDAPI_KEY', '')
    vi.stubEnv('ZAPI_KEY', '')
    expect(selectFallbackProvider({ name: 'zapi' } as never)?.name).not.toBe('mock')
    expect(selectFallbackProvider({ name: 'rapidapi' } as never)?.name).not.toBe('mock')
  })
})

// ── Trend Radar enrichment ──────────────────────────────────────────────────
import { enrichInstagramItems } from '@/lib/integrations/scrapers/zapi'

describe('enrichInstagramItems', () => {
  function stubPost(body: unknown) {
    vi.stubEnv('ZAPI_KEY', 'zpi_test')
    const spy = vi.fn(async () => ({
      ok: true, status: 200, headers: { get: () => null }, json: async () => body,
    }))
    vi.stubGlobal('fetch', spy)
    return spy
  }

  it('fills the numbers the DOM scrape missed', async () => {
    stubPost({ playCount: 120000, likeCount: 3400 })
    const out = await enrichInstagramItems([
      { url: 'https://www.instagram.com/reel/ABC123/', views: null, likes: null },
    ])
    expect(out[0]).toMatchObject({ views: 120000, likes: 3400 })
  })

  it('never overwrites a number discovery already found', async () => {
    stubPost({ playCount: 999, likeCount: 999 })
    const out = await enrichInstagramItems([
      { url: 'https://www.instagram.com/reel/ABC123/', views: 5, likes: null },
    ])
    expect(out[0].views).toBe(5)
    expect(out[0].likes).toBe(999)
  })

  it('spends no quota when every item already has both numbers', async () => {
    const spy = stubPost({ playCount: 1 })
    await enrichInstagramItems([{ url: 'https://www.instagram.com/p/A/', views: 1, likes: 2 }])
    expect(spy).not.toHaveBeenCalled()
  })

  it('is a no-op without a key, so Trend Radar works unchanged', async () => {
    vi.stubEnv('ZAPI_KEY', '')
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    const items = [{ url: 'https://www.instagram.com/p/A/', views: null, likes: null }]
    expect(await enrichInstagramItems(items)).toEqual(items)
    expect(spy).not.toHaveBeenCalled()
  })

  it('keeps the item when Zapi errors — a search must not fail over enrichment', async () => {
    vi.stubEnv('ZAPI_KEY', 'zpi_test')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom') }))
    const out = await enrichInstagramItems([{ url: 'https://www.instagram.com/p/A/', views: null, likes: null }])
    expect(out).toHaveLength(1)
    expect(out[0].views).toBeNull()
  })

  it('skips a URL with no recognisable shortcode', async () => {
    const spy = stubPost({ playCount: 1 })
    const out = await enrichInstagramItems([{ url: 'https://example.com/whatever', views: null, likes: null }])
    expect(spy).not.toHaveBeenCalled()
    expect(out[0].views).toBeNull()
  })

  it('reads a count nested as { count }', async () => {
    stubPost({ edge_liked_by: { count: 77 } })
    const out = await enrichInstagramItems([{ url: 'https://www.instagram.com/p/A/', views: null, likes: null }])
    expect(out[0].likes).toBe(77)
  })

  it('preserves order when enriching several items', async () => {
    vi.stubEnv('ZAPI_KEY', 'zpi_test')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ playCount: url.includes('/AAA') ? 1 : 2 }),
    })))
    const out = await enrichInstagramItems([
      { url: 'https://www.instagram.com/p/AAA/', views: null, likes: null },
      { url: 'https://www.instagram.com/p/BBB/', views: null, likes: null },
    ])
    expect(out.map((i) => i.views)).toEqual([1, 2])
  })
})

// ── Live response envelope ──────────────────────────────────────────────────
// Verified against api.zpi.web.id: every success is wrapped in
// { project, data, timestamp }. The docs' "Example response" shows only the
// INNER object, so a client written from the docs alone reads nothing at all.
const REAL_IG_PROFILE_ENVELOPE = {
  project: 'social-media:instagram-scraper',
  timestamp: '2026-08-04T05:00:00.000Z',
  data: {
    userId: '25025320', username: 'instagram', fullName: 'Instagram',
    biography: "Discover what's new on Instagram", avatar: 'https://cdn.example/a.jpg',
    isVerified: true, isPrivate: false, followerCount: 685800000,
    followingCount: 268, postCount: 8544,
  },
}

const REAL_TIKTOK_POSTS_ENVELOPE = {
  project: 'social-media:tiktok-scraper',
  timestamp: '2026-08-04T05:00:00.000Z',
  data: {
    username: 'mrbeast', page: 1, nextPage: 2, count: 1, hasMore: true,
    videos: [{
      videoId: '7534', title: 'Btw this dance took me hours to learn',
      playCount: 79296352, diggCount: 15046228, commentCount: 510463,
      shareCount: 6090841, collectCount: 1708133, createTime: 1785708879,
    }],
  },
}

describe('response envelope', () => {
  function stubJson(body: unknown) {
    vi.stubEnv('ZAPI_KEY', 'zpi_test')
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, headers: { get: () => null }, json: async () => body,
    })))
  }

  it('unwraps { project, data, timestamp } so callers see the documented shape', async () => {
    stubJson(REAL_IG_PROFILE_ENVELOPE)
    const profile = await fetchTikTokProfile('instagram') as Record<string, unknown>
    expect(profile.followerCount).toBe(685800000)
    expect(profile.project).toBeUndefined()
  })

  it('passes a bare object through untouched', async () => {
    stubJson({ followerCount: 5 })
    expect(await fetchTikTokProfile('x')).toMatchObject({ followerCount: 5 })
  })

  it('normalizes a real unwrapped Instagram profile', () => {
    const acc = normalizeAccount('instagram', 'instagram', REAL_IG_PROFILE_ENVELOPE.data, [], 'zapi')
    expect(acc.followers).toBe(685800000)
    expect(acc.displayName).toBe('Instagram')
    expect(acc.totalPosts).toBe(8544)
    expect(acc.verified).toBe(true)
    expect(acc.avatarUrl).toBe('https://cdn.example/a.jpg')
  })

  it('normalizes real unwrapped TikTok posts', () => {
    const posts = normalizePosts(REAL_TIKTOK_POSTS_ENVELOPE.data)
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({
      id: '7534', views: 79296352, likes: 15046228, comments: 510463, shares: 6090841,
    })
    expect(posts[0].saves).toBe(1708133)
  })
})
