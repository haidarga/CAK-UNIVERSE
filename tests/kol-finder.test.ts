import { describe, it, expect } from 'vitest'
import { tierOf, tierLabel, KOL_TIERS } from '@/lib/kol/tiers'
import { guessRegionFromBio, regionMatches, regionsByIsland } from '@/lib/kol/regions'
import { parseQuery } from '@/lib/kol/discover'
import { performanceFromVideos } from '@/lib/kol/enrich'
import { buildFlags, scoreResult, compareResults } from '@/lib/kol/score'
import { profileFromSearchUser, mapWithConcurrency } from '@/lib/kol/resolve'
import type { KolResult } from '@/lib/kol/types'

describe('tier boundaries', () => {
  it('places each brief-defined boundary in exactly one bucket', () => {
    expect(tierOf(0)).toBe('nano')
    expect(tierOf(9_999)).toBe('nano')
    expect(tierOf(10_000)).toBe('mikro')
    expect(tierOf(49_999)).toBe('mikro')
    expect(tierOf(50_000)).toBe('middle')
    expect(tierOf(99_999)).toBe('middle')
    expect(tierOf(100_000)).toBe('makro')
    expect(tierOf(999_999)).toBe('makro')
    expect(tierOf(1_000_000)).toBe('mega')
    expect(tierOf(20_000_000)).toBe('mega')
  })

  it('never assigns a tier to an unreadable follower count', () => {
    expect(tierOf(null)).toBeNull()
    expect(tierOf(undefined)).toBeNull()
    expect(tierOf(NaN)).toBeNull()
    expect(tierOf(-5)).toBeNull()
    expect(tierLabel(null)).toBe('—')
  })

  it('leaves no gap between adjacent tiers', () => {
    for (let i = 0; i < KOL_TIERS.length - 1; i++) {
      expect(KOL_TIERS[i].max).toBe(KOL_TIERS[i + 1].min)
    }
  })
})

describe('region inference', () => {
  it('reads an explicit city out of a bio and shows its evidence', () => {
    const g = guessRegionFromBio('Content creator | Bandung 📍 | DM for endorse')
    expect(g.area).toBe('jawa-barat')
    expect(g.source).toBe('bio')
    expect(g.evidence).toBe('bandung')
  })

  it('returns unknown rather than guessing when the bio names no place', () => {
    // The common case by a wide margin: 0 of 58 real Indonesian creators named
    // a city. Silence here must stay silence, never a default region.
    const g = guessRegionFromBio('✨spill skincare, haircare, bodycare, etc🪞')
    expect(g.area).toBeNull()
    expect(g.source).toBe('none')
  })

  it('does not let a substring create a false location', () => {
    // "bali" inside "balikpapan" would put a Kalimantan creator in Bali.
    expect(guessRegionFromBio('Kuliner Balikpapan').area).toBe('kalimantan-timur')
    // "solo" inside "solopreneur" would invent a Central Java creator.
    expect(guessRegionFromBio('solopreneur & digital nomad').area).toBeNull()
  })

  it('prefers a specific province over the Jabodetabek umbrella', () => {
    expect(guessRegionFromBio('Bandung, Jawa Barat').area).toBe('jawa-barat')
  })

  it('treats an unknown location as failing a specific filter', () => {
    const unknown = guessRegionFromBio('')
    expect(regionMatches(unknown, 'bali')).toBe(false)
    // ...but passing no filter at all still lets everyone through.
    expect(regionMatches(unknown, null)).toBe(true)
  })

  it('accepts DKI Jakarta under the Jabodetabek umbrella', () => {
    expect(regionMatches({ area: 'dki-jakarta', source: 'bio' }, 'jabodetabek')).toBe(true)
  })

  it('accepts any province on an island when an island is requested', () => {
    expect(regionMatches({ area: 'jawa-timur', source: 'bio' }, 'Jawa')).toBe(true)
    expect(regionMatches({ area: 'bali', source: 'bio' }, 'Jawa')).toBe(false)
  })

  it('groups every region under an island with none orphaned', () => {
    const grouped = regionsByIsland()
    const total = grouped.reduce((a, g) => a + g.regions.length, 0)
    expect(total).toBeGreaterThan(20)
    expect(grouped.every((g) => g.regions.length > 0)).toBe(true)
  })
})

describe('query parsing', () => {
  it('separates hashtags from plain keywords', () => {
    const { hashtags, keywords } = parseQuery('#skincare, glowing skin')
    expect(hashtags).toContain('skincare')
    expect(keywords).toContain('glowing skin')
  })

  it('also tries a multi-word phrase as a collapsed hashtag', () => {
    // How Indonesian creators actually tag: "skincare indonesia" lives at
    // #skincareindonesia, and searching only the phrase would miss the tag.
    const { hashtags } = parseQuery('skincare indonesia')
    expect(hashtags).toContain('skincareindonesia')
  })

  it('deduplicates so one tag is not swept twice', () => {
    const { hashtags } = parseQuery('#gaming, gaming, #gaming')
    expect(hashtags.filter((h) => h === 'gaming')).toHaveLength(1)
  })
})

describe('performance measurement', () => {
  const day = 86_400_000
  const now = Date.parse('2026-08-31T00:00:00Z')
  const video = (over: Record<string, unknown>) => ({
    playCount: 1000, diggCount: 50, commentCount: 5,
    createTimeIso: new Date(now - day).toISOString(), ...over,
  })

  it('measures engagement against views, not followers', () => {
    // TikTok reach comes from the For You feed, so a follower-based ratio
    // produces impossible figures — a real 56k-follower account averaging 1.1M
    // views reads as 66% on followers and 3.3% on views.
    const perf = performanceFromVideos([video({ playCount: 1_131_689, diggCount: 37_787 })], now)
    expect(perf.engagementRate).toBeCloseTo(3.3, 1)
  })

  it('exposes a dormant account that a hashtag feed would rank first', () => {
    // @glowbyme_ live: one old viral video put it top of #skincareindonesia,
    // while its own feed showed 663 views, 8 likes, sixteen months idle.
    const stale = new Date(now - 500 * day).toISOString()
    const perf = performanceFromVideos([video({ playCount: 663, diggCount: 8, createTimeIso: stale })], now)
    expect(perf.daysSinceLastPost).toBe(500)
    expect(perf.avgViews).toBe(663)
    const flags = buildFlags(
      { handle: 'x', displayName: null, bio: null, followers: 18_016, following: null, totalVideos: null, totalHearts: null, country: 'ID', verified: false, isPrivate: false, avatarUrl: null, instagramHandle: null, profileUrl: '' },
      'mikro', perf, { area: null, source: 'none' }, null,
    )
    expect(flags.some((f) => f.code === 'dormant')).toBe(true)
  })

  it('excludes ads, whose reach reflects a media budget not an audience', () => {
    const perf = performanceFromVideos([
      video({ playCount: 100, diggCount: 10 }),
      video({ playCount: 1_000_000, diggCount: 5, isAd: true }),
    ], now)
    expect(perf.sampleSize).toBe(1)
    expect(perf.avgViews).toBe(100)
  })

  it('reports unknown rather than zero when nothing is measurable', () => {
    const perf = performanceFromVideos([{ videoId: 'x' }], now)
    expect(perf.avgViews).toBeNull()
    expect(perf.engagementRate).toBeNull()
    expect(perf.daysSinceLastPost).toBeNull()
  })

  it('uses the median gap so one hiatus does not redefine a weekly poster', () => {
    const at = (d: number) => new Date(now - d * day).toISOString()
    const perf = performanceFromVideos(
      [at(0), at(7), at(14), at(21), at(400)].map((createTimeIso) => video({ createTimeIso })),
      now,
    )
    expect(perf.postingCadenceDays).toBe(7)
  })
})

describe('scoring', () => {
  const perf = (over: Record<string, unknown>) => ({
    sampleSize: 20, avgViews: 10_000, avgLikes: 500, avgComments: 20,
    engagementRate: 5, lastPostAt: null, daysSinceLastPost: 2, postingCadenceDays: 3, ...over,
  })

  it('ranks an active strong creator above a dormant one', () => {
    const active = scoreResult(perf({}), null, [])
    const dormant = scoreResult(perf({ daysSinceLastPost: 400 }), null, [])
    expect(active).toBeGreaterThan(dormant)
  })

  it('rewards niche consistency and penalises a one-off match', () => {
    const consistent = scoreResult(perf({}), { matched: 11, total: 12, label: null, reason: null }, [])
    const occasional = scoreResult(perf({}), { matched: 1, total: 12, label: null, reason: null }, [])
    expect(consistent).toBeGreaterThan(occasional)
  })

  it('stays inside 0-100 at both extremes', () => {
    const best = scoreResult(perf({ engagementRate: 40, daysSinceLastPost: 0 }), { matched: 20, total: 20, label: null, reason: null }, [])
    const worst = scoreResult(perf({ engagementRate: 0, daysSinceLastPost: 2000, sampleSize: 1 }), { matched: 0, total: 20, label: null, reason: null }, [{ kind: 'warn', code: 'private', message: '' }])
    expect(best).toBeLessThanOrEqual(100)
    expect(worst).toBeGreaterThanOrEqual(0)
  })

  it('orders by score, then recency, then reach', () => {
    const mk = (score: number, days: number, followers: number) => ({
      score, performance: { daysSinceLastPost: days }, profile: { followers },
    }) as unknown as KolResult
    const sorted = [mk(50, 1, 100), mk(80, 30, 10), mk(50, 1, 900)].sort(compareResults)
    expect(sorted[0].score).toBe(80)
    expect(sorted[1].profile.followers).toBe(900)
  })
})

describe('resolve', () => {
  it('maps a provider row without turning a missing count into zero', () => {
    const p = profileFromSearchUser({ username: 'x', nickname: 'X', signature: 'bio', region: 'ID', verified: true })
    expect(p.followers).toBeNull()
    expect(p.country).toBe('ID')
    expect(p.verified).toBe(true)
    expect(p.profileUrl).toContain('@x')
  })

  it('keeps results aligned with their inputs under concurrency', async () => {
    const items = Array.from({ length: 25 }, (_, i) => i)
    const out = await mapWithConcurrency(items, 8, async (n) => {
      await new Promise((r) => setTimeout(r, (25 - n) % 7))
      return n * 2
    })
    expect(out).toEqual(items.map((n) => n * 2))
  })
})
