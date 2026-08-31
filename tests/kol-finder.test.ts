import { describe, it, expect } from 'vitest'
import { tierOf, tierLabel, KOL_TIERS } from '@/lib/kol/tiers'
import { regionsByIsland, regionHashtags } from '@/lib/kol/regions'
import { detectRegion, detectionMatches } from '@/lib/kol/region-detect'
import { parseQuery, MAX_HASHTAGS, MAX_KEYWORDS } from '@/lib/kol/discover'
import { performanceFromVideos } from '@/lib/kol/enrich'
import { buildFlags, scoreResult, compareResults, engagementIsMeaningful } from '@/lib/kol/score'
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

describe('region detection', () => {
  // Every case below is a real creator the first (bio-only, first-match-wins)
  // version got wrong.

  it('reads a city out of a compound hashtag, which a word boundary cannot', () => {
    // #kulinerbandung is one token — "bandung" has no separator around it.
    const d = detectRegion({ handle: 'sabibiin', bio: null, captions: ['enak banget #seblakbandung #kulinerbandung'] })
    expect(d.area).toBe('jawa-barat')
    expect(d.evidence).toContain('#')
  })

  it('lets the dominant city win instead of whichever was mentioned first', () => {
    // @kulinerkabandung landed in Bali because one post carried #bali.
    const d = detectRegion({
      handle: 'kulinerkabandung',
      bio: 'Kuliner Bandung tiap hari',
      captions: ['liburan ke #bali', '#kulinerbandung', '#cafebandung', '#bandungfoodies'],
    })
    expect(d.area).toBe('jawa-barat')
    expect(d.alternates).not.toContain('jawa-barat')
  })

  it('trusts the handle, which often names the city outright', () => {
    const d = detectRegion({ handle: 'lombokwisatatransport', bio: null, captions: ['trip seru bareng kami'] })
    expect(d.area).toBe('nusa-tenggara')
  })

  it('weighs a real post geo tag above loose prose', () => {
    const d = detectRegion({
      handle: 'x',
      bio: 'sering ke bandung',
      captions: [],
      geoTags: ['Jakarta, Indonesia', 'Jakarta, Indonesia'],
    })
    expect(d.area).toBe('dki-jakarta')
  })

  it('refuses to place a creator who roams the whole country', () => {
    // A travel account naming six provinces has no home province, and inventing
    // one is worse than saying so.
    const d = detectRegion({
      handle: 'jalanjalanindo',
      bio: null,
      captions: ['#wisatabali', '#wisatalombok', '#wisatajogja', '#wisatamedan', '#wisatapapua', '#wisatamakassar'],
    })
    expect(d.area).toBeNull()
    expect(d.evidence).toMatch(/dominan/i)
  })

  it('ignores place names that are ordinary Indonesian words', () => {
    // "medan perang" is a battlefield, not North Sumatra. This exact phrase put
    // a Kalimantan creator in Sumatera Utara.
    expect(detectRegion({ bio: 'terjun ke medan perang tiap hari', captions: [] }).area).toBeNull()
    // "nasib malang" is bad luck, not the city of Malang.
    expect(detectRegion({ bio: 'cerita nasib malang', captions: [] }).area).toBeNull()
    // ...but marked properly it counts.
    expect(detectRegion({ bio: 'kuliner di medan', captions: [], handle: 'x' }).area).toBe('sumatera-utara')
  })

  it('does not let a substring create a false location', () => {
    const d = detectRegion({ bio: 'Kuliner Balikpapan', captions: [] })
    expect(d.area).toBe('kalimantan-timur')
  })

  it('reports low confidence rather than silence when the win is narrow', () => {
    const d = detectRegion({ handle: 'x', bio: null, captions: ['#kulinerjakarta', '#kulinerbandung', '#kulinerjakarta'] })
    expect(d.area).toBe('dki-jakarta')
    expect(d.dominance).toBeLessThan(1)
  })

  it('treats an unknown location as failing a specific filter', () => {
    const unknown = detectRegion({ bio: '', captions: [] })
    expect(detectionMatches(unknown, 'bali')).toBe(false)
    expect(detectionMatches(unknown, null)).toBe(true)
  })

  it('keeps Jabodetabek a campaign scope, not a province', () => {
    const jakarta = detectRegion({ bio: 'kuliner jakarta', captions: [], handle: 'x' })
    expect(detectionMatches(jakarta, 'jabodetabek')).toBe(true)
    // Bandung is Jawa Barat and must never pass a Jabodetabek filter.
    const bandung = detectRegion({ bio: 'kuliner bandung', captions: [], handle: 'x' })
    expect(detectionMatches(bandung, 'jabodetabek')).toBe(false)
  })

  it('accepts any province on an island when an island is requested', () => {
    const surabaya = detectRegion({ bio: 'kuliner surabaya', captions: [], handle: 'x' })
    expect(detectionMatches(surabaya, 'Jawa')).toBe(true)
    expect(detectionMatches(surabaya, 'Sumatera')).toBe(false)
  })

  it('groups every region under an island with none orphaned', () => {
    const grouped = regionsByIsland()
    expect(grouped.reduce((a, g) => a + g.regions.length, 0)).toBeGreaterThan(20)
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
      'mikro', perf, { area: null, confidence: null, evidence: null, dominance: 0, alternates: [] }, null,
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

  it('refuses to reward a huge ratio built on a handful of views', () => {
    // Live on Instagram: an 805-follower account averaging 11 views and 3 likes
    // scored 27.3% and would have topped the list. The ratio is arithmetically
    // right and completely meaningless.
    const noise = perf({ engagementRate: 27.3, avgViews: 11, avgLikes: 3 })
    expect(engagementIsMeaningful(noise)).toBe(false)
    const real = perf({ engagementRate: 5, avgViews: 50_000 })
    expect(scoreResult(real, null, [])).toBeGreaterThan(scoreResult(noise, null, []))
  })

  it('says out loud when engagement rests on too little reach', () => {
    const flags = buildFlags(
      { handle: 'x', displayName: null, bio: null, followers: 805, following: null, totalVideos: null, totalHearts: null, country: null, verified: false, isPrivate: false, avatarUrl: null, instagramHandle: null, profileUrl: '' },
      'nano',
      perf({ engagementRate: 27.3, avgViews: 11, avgLikes: 3 }),
      { area: null, confidence: null, evidence: null, dominance: 0, alternates: [] },
      null,
    )
    expect(flags.some((f) => f.code === 'low-volume')).toBe(true)
    expect(flags.some((f) => f.code === 'high-engagement')).toBe(false)
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

describe('funnel reporting', () => {
  // The first version reported a single "85 gak masuk filter", which reads as a
  // failure and tells the reader nothing about what to change. These fields are
  // what turn that into an action.
  it('keeps a meta shape that can explain every drop', () => {
    const meta = {
      candidatesFound: 131, resolved: 90, filteredOut: 85,
      droppedByCountry: 12, droppedByTier: 70, droppedNoFollowers: 3,
      tierSpread: { makro: 47, mikro: 23 },
    }
    expect(meta.droppedByCountry + meta.droppedByTier + meta.droppedNoFollowers).toBe(meta.filteredOut)
    // The tier breakdown must account for exactly the tier rejects, or the
    // "+47 makro" buttons would promise results that do not exist.
    expect(Object.values(meta.tierSpread).reduce((a, b) => a + b, 0)).toBe(meta.droppedByTier)
  })
})

describe('discovery country pass', () => {
  // Every video row carries the country it was posted from, and it arrives free
  // with discovery. Ignoring it meant a globally-used hashtag filled all 90
  // candidate slots with American creators, resolved every one at full cost,
  // then discarded all of them — 2m25s to show zero results.
  const keep = (regions: (string | null)[], want: string) => {
    const seen = regions.filter(Boolean) as string[]
    return !(seen.length && !seen.some((r) => r.toUpperCase() === want))
  }

  it('drops a creator whose every seen video came from elsewhere', () => {
    expect(keep(['US', 'US', 'GB'], 'ID')).toBe(false)
  })

  it('keeps a creator with even one video from the target country', () => {
    expect(keep(['US', 'ID'], 'ID')).toBe(true)
  })

  it('keeps a creator with no country on any video', () => {
    // Absence of the field is not evidence of a foreign account, and dropping on
    // silence would quietly delete real candidates.
    expect(keep([null, null], 'ID')).toBe(true)
    expect(keep([], 'ID')).toBe(true)
  })
})

describe('fan-out caps', () => {
  // A security audit found the query string was bounded to 200 characters but
  // the NUMBER of terms inside it was not. A comma-separated list fit 60-90
  // hashtags, each opening its own paged sweep in parallel — up to ~900 TikTok
  // requests, or 60-90 simultaneous Apify runs at up to 120 BILLED results each,
  // from a single POST with no rate limiting in front of it.
  it('caps how many terms one request may fan out to', () => {
    const many = Array.from({ length: 40 }, (_, i) => `#tag${i}`).join(',')
    const { hashtags, dropped } = parseQuery(many)
    expect(hashtags.length).toBeLessThanOrEqual(MAX_HASHTAGS)
    expect(dropped).toBeGreaterThan(0)
  })

  it('caps keywords as well as hashtags', () => {
    const { keywords, dropped } = parseQuery('satu dua, tiga empat, lima enam, tujuh delapan, sembilan sepuluh')
    expect(keywords.length).toBeLessThanOrEqual(MAX_KEYWORDS)
    expect(dropped).toBeGreaterThan(0)
  })

  it('reports nothing dropped for an ordinary query', () => {
    // The cap must be invisible in normal use, or it becomes noise people learn
    // to ignore.
    expect(parseQuery('#skincareindonesia').dropped).toBe(0)
    expect(parseQuery('#kuliner, #kulinerbandung, jajanan bandung').dropped).toBe(0)
  })
})

describe('ambiguous place names inside handles and hashtags', () => {
  // An audit found the ambiguous-word guard only ran on prose. Handles and
  // hashtags used bare substring matching, so "@soloqueen_mua" cast a weight-6
  // vote for Surakarta and came back as a HIGH-confidence location — a measured-
  // looking answer manufactured from an unrelated English word.

  it('does not turn an unrelated handle into a location', () => {
    expect(detectRegion({ handle: 'soloqueen_mua', bio: null, captions: [] }).area).toBeNull()
    expect(detectRegion({ handle: 'metrolifestyle', bio: null, captions: [] }).area).toBeNull()
  })

  it('does not read a hashtag that merely contains an ambiguous word', () => {
    // Solo travel, not the city of Solo.
    expect(detectRegion({ handle: 'x', bio: null, captions: ['#solotravel #solotrip'] }).area).toBeNull()
    // Guitar solo.
    expect(detectRegion({ handle: 'x', bio: null, captions: ['#gitarsolo #musik'] }).area).toBeNull()
  })

  it('still reads an ambiguous word when the tag marks it as a place', () => {
    expect(detectRegion({ handle: 'x', bio: null, captions: ['#kulinersolo', '#kulinersolo'] }).area).toBe('jawa-tengah')
    expect(detectRegion({ handle: 'x', bio: null, captions: ['#wisatamedan', '#kulinermedan'] }).area).toBe('sumatera-utara')
  })

  it('leaves unambiguous city names working exactly as before', () => {
    // The guard must not cost coverage on the names that were never a problem.
    expect(detectRegion({ handle: 'x', bio: null, captions: ['#kulinerbandung'] }).area).toBe('jawa-barat')
    expect(detectRegion({ handle: 'lombokwisatatransport', bio: null, captions: [] }).area).toBe('nusa-tenggara')
  })
})

describe('filters rank, they do not gate', () => {
  // The design failure this replaces: country AND tier AND region AND activity,
  // each one a hard gate in series. Every gate worked correctly and the reader
  // routinely got zero rows with no way to tell how close they came. A real
  // search returning "0 KOL" is worse than useless — it reads as "this niche is
  // empty" when the truth was "your four filters intersected at nothing".
  it('scores an off-tier creator below a matching one instead of removing it', () => {
    const perf = {
      sampleSize: 20, avgViews: 50_000, avgLikes: 2_500, avgComments: 40,
      engagementRate: 5, lastPostAt: null, daysSinceLastPost: 2, postingCadenceDays: 3,
    }
    const matching = scoreResult(perf, null, [])
    const offTier = scoreResult(perf, null, [{ kind: 'warn', code: 'off-tier', message: '' }])
    expect(offTier).toBeLessThan(matching)
    // ...but still on the board, not zeroed out of existence.
    expect(offTier).toBeGreaterThan(0)
  })

  it('says out loud when a country could not be read instead of assuming Indonesia', () => {
    // A null country used to pass the "Indonesia doang" filter in silence, so
    // foreign creators with blank metadata arrived looking local.
    const flags = buildFlags(
      { handle: 'x', displayName: null, bio: null, followers: 20_000, following: null, totalVideos: null, totalHearts: null, country: null, verified: false, isPrivate: false, avatarUrl: null, instagramHandle: null, profileUrl: '' },
      'mikro', null, { area: null, confidence: null, evidence: null, dominance: 0, alternates: [] }, null,
      { wantedCountry: 'ID' },
    )
    expect(flags.some((f) => f.code === 'unknown-country')).toBe(true)
  })

  it('does not warn about country when the reader did not ask for one', () => {
    const flags = buildFlags(
      { handle: 'x', displayName: null, bio: null, followers: 20_000, following: null, totalVideos: null, totalHearts: null, country: null, verified: false, isPrivate: false, avatarUrl: null, instagramHandle: null, profileUrl: '' },
      'mikro', null, { area: null, confidence: null, evidence: null, dominance: 0, alternates: [] }, null,
      { wantedCountry: null },
    )
    expect(flags.some((f) => f.code === 'unknown-country')).toBe(false)
  })

  it('labels an off-tier creator rather than silently reclassifying them', () => {
    const flags = buildFlags(
      { handle: 'x', displayName: null, bio: null, followers: 5_000_000, following: null, totalVideos: null, totalHearts: null, country: 'ID', verified: false, isPrivate: false, avatarUrl: null, instagramHandle: null, profileUrl: '' },
      'mega', null, { area: null, confidence: null, evidence: null, dominance: 0, alternates: [] }, null,
      { tierMatch: false },
    )
    const off = flags.find((f) => f.code === 'off-tier')
    expect(off).toBeTruthy()
    expect(off!.message).toContain('mega')
  })
})

describe('region evidence, not just arithmetic', () => {
  // Screenshot evidence from a perfume search: a bio reading "Jakarta📍" came
  // back as "DKI Jakarta ?" — hedging on the one thing the creator stated
  // outright — while an account whose bio sold digital products was assigned
  // "Jawa Tengah" off a single drifting word.

  it('treats an explicit bio mention as settled, not a maybe', () => {
    const d = detectRegion({ handle: 'jery16_', bio: 'Jakarta📍 Hanya cowo yang pengen wangi', captions: [] })
    expect(d.area).toBe('dki-jakarta')
    expect(d.confidence).toBe('tinggi')
  })

  it('refuses to name a province off one drifting word in one caption', () => {
    const d = detectRegion({
      handle: 'cerdasdigital27',
      bio: 'Mau dapat CUAN dari Product Digital??? Klik Link Dibawah Ini!!',
      captions: ['cuan terus tiap hari', 'pernah ke semarang sekali', 'link di bio'],
    })
    expect(d.area).toBeNull()
  })

  it('accepts a location hashtag the creator typed on purpose', () => {
    // Deliberate, unlike a word that drifted through a sentence.
    expect(detectRegion({ handle: 'x', bio: null, captions: ['#kulinerbandung'] }).area).toBe('jawa-barat')
  })

  it('accepts the same place appearing across separate posts', () => {
    const d = detectRegion({ handle: 'x', bio: null, captions: ['makan di bandung', 'balik ke bandung lagi'] })
    expect(d.area).toBe('jawa-barat')
  })
})

describe('signals that reach creators who never name a place', () => {
  // Measured coverage before these: ~90% on food and travel, ~25% on fashion
  // and beauty. The gap is entirely creators who never write a city anywhere,
  // so the fix has to come from something other than place names.

  it('reads a city out of a mentioned local business', () => {
    // A shop handle carries its city far more reliably than the creator's prose:
    // @noahs_barn_bandung exists once in the world.
    const d = detectRegion({
      handle: 'x', bio: null,
      captions: ['ngopi pagi di @noahs_barn_bandung', 'balik lagi ke @noahs_barn_bandung'],
    })
    expect(d.area).toBe('jawa-barat')
  })

  it('uses regional speech as support, never as the deciding vote', () => {
    // Dialect alone is too weak to name a province on its own.
    const alone = detectRegion({ handle: 'x', bio: 'enak pisan euy', captions: [] })
    expect(alone.area).toBeNull()
    // Paired with anything deliberate it tips the balance.
    const supported = detectRegion({ handle: 'x', bio: 'enak pisan euy', captions: ['#kulinerbandung'] })
    expect(supported.area).toBe('jawa-barat')
  })

  it('does not let a common word masquerade as dialect', () => {
    expect(detectRegion({ handle: 'x', bio: 'aku suka kamu', captions: [] }).area).toBeNull()
  })

  it('ignores an ambiguous word inside a mention, where there is no sentence to judge by', () => {
    // @solobeauty could be solo-anything; without prose around it there is
    // nothing to disambiguate against.
    expect(detectRegion({ handle: 'x', bio: null, captions: ['bareng @solobeautycare'] }).area).toBeNull()
  })
})

describe('region steers the sweep instead of trimming it', () => {
  it('builds the hashtags creators in that region actually type', () => {
    const tags = regionHashtags('jawa-barat', ['kuliner'])
    expect(tags).toContain('kulinerbandung')
    expect(tags.length).toBeLessThanOrEqual(4)
  })

  it('works for a niche where text inference fails entirely', () => {
    // A beauty creator never writes her city in her bio. She does write
    // #skincarejakarta when selling to her own city.
    expect(regionHashtags('dki-jakarta', ['skincare'])).toContain('skincarejakarta')
  })

  it('expands an island into the cities inside it', () => {
    expect(regionHashtags('Jawa', ['ootd']).length).toBeGreaterThan(0)
  })

  it('returns nothing when no region was chosen', () => {
    expect(regionHashtags(null, ['kuliner'])).toEqual([])
  })

  it('never builds a hashtag that repeats the place twice', () => {
    // "#kulinerbandungbandung" from a query that already named the city.
    expect(regionHashtags('jawa-barat', ['kulinerbandung'])).not.toContain('kulinerbandungbandung')
  })
})

describe('region steering stays inside the cost cap', () => {
  // Region tags were added ON TOP of MAX_HASHTAGS, so a "Dalam" sweep could hit
  // nine hashtags at fifteen pages each — the exact blowout the cap exists for.
  it('never asks for more region tags than the reserved slots', () => {
    expect(regionHashtags('jawa-barat', ['kuliner'], 2).length).toBeLessThanOrEqual(2)
  })

  it('spreads an island across its provinces instead of draining the first', () => {
    // Picking "Jawa" used to return only Jabodetabek satellite towns, never
    // Bandung or Surabaya — a filter chosen to widen coverage narrowed it.
    const tags = regionHashtags('Jawa', ['kuliner'], 8)
    const areas = new Set(tags.map((t) => t.replace('kuliner', '')))
    expect(areas.size).toBeGreaterThan(2)
  })

  it('refuses to staple a second city onto a query that already names one', () => {
    // "kulinerbandungcirebon" is a tag nobody has ever typed.
    const tags = regionHashtags('jawa-barat', ['kulinerbandung'], 4)
    expect(tags.every((t) => !t.includes('bandung') || t === 'kulinerbandung')).toBe(true)
  })
})

describe('dialect words must not be ordinary language', () => {
  // Each of these shipped in the first draft and would fire on everyday captions.
  // A false dialect hit still adds weight to the dominance ratio, so it can tip
  // the winner to the wrong province — not merely fail to corroborate.
  it('does not read the drink "teh" as Sundanese', () => {
    expect(detectRegion({ handle: 'x', bio: null, captions: ['es teh manis paling enak', 'teh tarik dingin'] }).area).toBeNull()
  })

  it('does not read the camera setting "iso" as Javanese', () => {
    expect(detectRegion({ handle: 'x', bio: null, captions: ['shot on iso 400', 'iso rendah biar bersih'] }).area).toBeNull()
  })

  it('does not read nationwide "ndak" as Central Java', () => {
    expect(detectRegion({ handle: 'x', bio: null, captions: ['ndak nyangka seenak ini'] }).area).toBeNull()
  })

  it('still reads genuinely distinctive speech', () => {
    const d = detectRegion({ handle: 'x', bio: 'enak pisan atuh', captions: ['#kulinerbandung'] })
    expect(d.area).toBe('jawa-barat')
  })
})
