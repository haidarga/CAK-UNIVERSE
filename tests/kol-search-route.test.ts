import { describe, it, expect, vi, beforeEach } from 'vitest'

// Integration test for POST /api/kol/search.
//
// This is the one surface that could not be exercised by hand: the dev login
// credentials do not work locally, so the route had shipped with its auth,
// streaming, and persistence paths never once executed. Everything below the
// route was verified against the live provider; this covers the route itself.
//
// What it actually pins down:
//   · the NDJSON contract — progress lines, then exactly one terminal line
//   · that EVERY resolved profile reaches the cache, not just the visible rows
//     (the bug that made every repeat search as slow as the first)
//   · that a failing sweep still closes the stream with an error line instead
//     of hanging a client for the full 300s ceiling
//   · that a storage failure never destroys results the user waited for

const upsert = vi.fn().mockResolvedValue({ error: null })
const insert = vi.fn().mockResolvedValue({ error: null })
const cacheRows: unknown[] = []

vi.mock('@/lib/cakgpt/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue({}),
  createServiceClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'sw_kol_profiles') {
        return {
          upsert,
          // Mirrors the real chain: .select().eq(platform).gte(scraped_at).in(handles)
          select: () => ({
            eq: () => ({
              gte: () => ({
                in: (_col: string, handles: string[]) =>
                  Promise.resolve({ data: cacheRows.filter((r) => handles.includes((r as { handle: string }).handle)) }),
              }),
            }),
          }),
        }
      }
      return { insert }
    },
  })),
}))

vi.mock('@/lib/cakgpt/auth', () => ({
  requireUser: vi.fn().mockResolvedValue({ user: { id: 'user-1' }, unauthorized: null }),
}))

vi.mock('@/lib/cakgpt/active-client', () => ({
  getActiveClientId: vi.fn().mockResolvedValue('client-1'),
}))

const runKolSearch = vi.fn()
vi.mock('@/lib/kol/search', () => ({ runKolSearch: (...a: unknown[]) => runKolSearch(...a) }))

import { POST } from '@/app/api/kol/search/route'

function profile(handle: string, followers: number | null, country: string | null = 'ID') {
  return {
    handle, displayName: handle, bio: null, followers, following: null, totalVideos: null,
    totalHearts: null, country, verified: false, isPrivate: false, avatarUrl: null,
    instagramHandle: null, profileUrl: `https://www.tiktok.com/@${handle}`,
  }
}

const meta = {
  query: '#x', hashtagsUsed: ['x'], keywordsUsed: [], candidatesFound: 3, resolved: 3,
  filteredOut: 2, droppedByCountry: 1, droppedForeignEarly: 0, droppedByTier: 1,
  droppedNoFollowers: 0, tierSpread: { makro: 1 }, enriched: 1, fromCache: 0,
  elapsedMs: 1234, truncated: null, warnings: [],
}

function req(body: unknown) {
  return new Request('http://localhost/api/kol/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function readLines(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text()
  return text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
}

beforeEach(() => {
  upsert.mockClear().mockResolvedValue({ error: null })
  insert.mockClear().mockResolvedValue({ error: null })
  runKolSearch.mockReset()
  cacheRows.length = 0
})

describe('POST /api/kol/search', () => {
  it('rejects a body that is not JSON without touching the scrapers', async () => {
    const res = await POST(req('not json at all'))
    expect(res.status).toBe(400)
    expect(runKolSearch).not.toHaveBeenCalled()
  })

  it('rejects a query too short to mean anything', async () => {
    const res = await POST(req({ query: 'a' }))
    expect(res.status).toBe(400)
    expect(runKolSearch).not.toHaveBeenCalled()
  })

  it('defaults to TikTok and Indonesia when the client omits them', async () => {
    runKolSearch.mockResolvedValue({ results: [], resolvedProfiles: [], meta })
    await POST(req({ query: '#skincareindonesia' }))
    const input = runKolSearch.mock.calls[0][0]
    expect(input.platform).toBe('tiktok')
    // The default matters: every "indonesia" hashtag leaks Malaysian and Thai
    // creators, verified live.
    expect(input.country).toBe('ID')
  })

  it('streams progress lines and exactly one terminal result line', async () => {
    runKolSearch.mockImplementation(async (_input: unknown, deps: { onProgress?: (e: unknown) => void }) => {
      deps.onProgress?.({ stage: 'discover', message: 'Nyisir…' })
      deps.onProgress?.({ stage: 'resolve', message: '3 akun ketemu…' })
      return { results: [], resolvedProfiles: [], meta }
    })

    const res = await POST(req({ query: '#x' }))
    expect(res.headers.get('content-type')).toContain('x-ndjson')

    const lines = await readLines(res)
    expect(lines.filter((l) => l.type === 'progress')).toHaveLength(2)
    const terminal = lines.filter((l) => l.type === 'result' || l.type === 'error')
    expect(terminal).toHaveLength(1)
    expect(terminal[0].type).toBe('result')
    // Progress must arrive BEFORE the result, or the UI narrates a finished job.
    expect(lines[lines.length - 1].type).toBe('result')
  })

  it('caches EVERY resolved profile, not only the rows that survived filtering', async () => {
    // The regression this guards: a sweep resolved 90 accounts, cached the 4 it
    // displayed, and threw away 86 lookups it had already paid for — so the next
    // search was never faster than the first.
    const survivor = profile('lolos', 20_000)
    const filteredOut = [profile('kegedean', 5_000_000), profile('luar', 1_000, 'US')]
    runKolSearch.mockResolvedValue({
      results: [{ platform: 'tiktok', profile: survivor, performance: { avgViews: 10 } }],
      resolvedProfiles: [survivor, ...filteredOut],
      meta,
    })

    await POST(req({ query: '#x' }))

    expect(upsert).toHaveBeenCalledTimes(1)
    const rows = upsert.mock.calls[0][0] as { handle: string; perf: unknown }[]
    expect(rows.map((r) => r.handle).sort()).toEqual(['kegedean', 'lolos', 'luar'])
    // Only the enriched row carries performance; the others still cache their
    // identity and follower count, which is all the tier filter needs next time.
    expect(rows.find((r) => r.handle === 'lolos')!.perf).toBeTruthy()
    expect(rows.find((r) => r.handle === 'luar')!.perf).toBeNull()
  })

  it('closes the stream with an error line when the sweep throws', async () => {
    // Without a terminal line the client waits out the full 300s route ceiling.
    runKolSearch.mockRejectedValue(new Error('Zapi lagi down'))
    const lines = await readLines(await POST(req({ query: '#x' })))
    expect(lines).toHaveLength(1)
    expect(lines[0].type).toBe('error')
    expect(lines[0].error).toContain('Zapi')
  })

  it('still returns results when the cache write fails', async () => {
    // A storage hiccup must not discard a search the user waited 90s for.
    upsert.mockRejectedValue(new Error('table missing'))
    runKolSearch.mockResolvedValue({
      results: [{ platform: 'tiktok', profile: profile('a', 1), performance: null }],
      resolvedProfiles: [profile('a', 1)],
      meta,
    })
    const lines = await readLines(await POST(req({ query: '#x' })))
    expect(lines.at(-1)!.type).toBe('result')
  })

  it('survives a cache read that returns nothing', async () => {
    // Migration not run yet, or an empty table: the sweep must still run.
    runKolSearch.mockResolvedValue({ results: [], resolvedProfiles: [], meta })
    const lines = await readLines(await POST(req({ query: '#x' })))
    expect(lines.at(-1)!.type).toBe('result')
    expect((await runKolSearch.mock.calls[0][1].lookupCache(['nobody'])).size).toBe(0)
  })

  it('looks the cache up BY HANDLE instead of preloading the table', async () => {
    // The preload asked for 5000 rows and PostgREST silently capped it at 1000,
    // so past a thousand creators an identical search hit a different arbitrary
    // slice of cache each time — the reported "makin diulang makin ngaco".
    cacheRows.push({
      handle: 'warm', display_name: 'Warm', bio: null, followers: 12_345, following: null,
      total_videos: null, total_hearts: null, country: 'ID', verified: false, is_private: false,
      avatar_url: null, instagram_handle: null, profile_url: null,
    })
    runKolSearch.mockResolvedValue({ results: [], resolvedProfiles: [], meta })
    await POST(req({ query: '#x' }))

    const lookup = runKolSearch.mock.calls[0][1].lookupCache
    const hit = await lookup(['warm'])
    expect(hit.get('warm').followers).toBe(12_345)
    // A missing profile_url is rebuilt for the right platform.
    expect(hit.get('warm').profileUrl).toContain('tiktok.com')
    // A handle this sweep did not find must never come back.
    expect((await lookup(['someone-else'])).size).toBe(0)
  })

  it('rebuilds an Instagram profile URL when the cached row has none', async () => {
    cacheRows.push({
      handle: 'warm', display_name: null, bio: null, followers: 1, following: null,
      total_videos: null, total_hearts: null, country: null, verified: false, is_private: false,
      avatar_url: null, instagram_handle: null, profile_url: null,
    })
    runKolSearch.mockResolvedValue({ results: [], resolvedProfiles: [], meta })
    await POST(req({ query: '#x', platform: 'instagram' }))
    const hit = await runKolSearch.mock.calls[0][1].lookupCache(['warm'])
    expect(hit.get('warm').profileUrl).toContain('instagram.com')
  })
})
