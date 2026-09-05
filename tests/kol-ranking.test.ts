import { describe, it, expect } from 'vitest'
import { scoreResult, compareResults, buildFlags } from '@/lib/kol/score'
import { looksLikeBusiness, isTooSmallToUse, missedReason } from '@/lib/kol/score'
import type { KolPerformance, KolProfile, KolResult } from '@/lib/kol/types'

// Written BEFORE the fix, from a real search the user ran: "gaming", tier Mikro,
// region Jawa Barat. What came back, in order:
//
//   #1  @fajaricoo1     Mikro · 0 of 18 posts on topic · last posted 67 days ago
//   #2  @rogstorebdg    Nano  · 12 of 13 posts on topic · posted 2 days ago · ER 3.4%
//
// The dead, off-topic account outranked the live, on-topic one for exactly one
// reason: it matched the requested tier. That is backwards. A creator who does
// not make the content being searched for is not a candidate at any size.

const perf = (over: Partial<KolPerformance> = {}): KolPerformance => ({
  sampleSize: 18, avgViews: 10_000, avgLikes: 400, avgComments: 20,
  engagementRate: 4, lastPostAt: null, daysSinceLastPost: 2, postingCadenceDays: 3, ...over,
})

const profile = (over: Partial<KolProfile> = {}): KolProfile => ({
  handle: 'x', displayName: null, bio: null, followers: 20_000, following: null,
  totalVideos: 100, totalHearts: null, country: 'ID', verified: false, isPrivate: false,
  avatarUrl: null, instagramHandle: null, profileUrl: '', ...over,
})

const noRegion = { area: null, confidence: null, evidence: null, dominance: 0, alternates: [] }

describe('relevance outranks tier', () => {
  it('puts an on-topic creator above an off-topic one even when only the latter matches the tier', () => {
    const onTopic = scoreResult(perf(), { matched: 12, total: 13, label: null, reason: null }, [
      { kind: 'warn', code: 'off-tier', message: '' },
    ])
    const offTopic = scoreResult(perf({ daysSinceLastPost: 67 }), { matched: 0, total: 18, label: null, reason: null }, [])
    expect(onTopic).toBeGreaterThan(offTopic)
  })

  it('treats a creator who makes none of the searched content as disqualified, not merely weaker', () => {
    // 0 of 18 is not "a bit off topic" — it is the wrong creator entirely, and
    // no follower count or location can rescue that.
    const irrelevant = scoreResult(perf(), { matched: 0, total: 18, label: null, reason: null }, [])
    expect(irrelevant).toBeLessThan(25)
  })

  it('still rewards a strong on-topic creator', () => {
    const strong = scoreResult(perf({ engagementRate: 7 }), { matched: 18, total: 18, label: null, reason: null }, [])
    expect(strong).toBeGreaterThan(70)
  })

  it('orders a full result list by merit, not by tier bucket', () => {
    const row = (over: Partial<KolResult>): KolResult => ({
      platform: 'tiktok', candidate: { handle: 'x', sources: [], seenVideos: [] },
      profile: profile(), tier: 'mikro', region: noRegion, performance: perf(),
      niche: null, flags: [], score: 0, ...over,
    })
    const dead = row({ tierMatch: true, score: 20, performance: perf({ daysSinceLastPost: 67 }) })
    const alive = row({ tierMatch: false, score: 80 })
    expect([dead, alive].sort(compareResults)[0]).toBe(alive)
  })
})

describe('shops are not creators', () => {
  it('recognises a store from its name', () => {
    expect(looksLikeBusiness(profile({ handle: 'rogstorebdg', displayName: 'ROG Store Bandung' }))).toBe(true)
    // A brand in the name is not enough on its own — "Playstation" says nothing
    // about who runs the account. The real bio does.
    expect(looksLikeBusiness(profile({ handle: 'sj.playstation', displayName: 'Sj Playstation Bandung' }))).toBe(false)
    expect(
      looksLikeBusiness(
        profile({
          handle: 'sj.playstation',
          displayName: 'Sj Playstation Bandung',
          bio: 'GAMING PLACE TERNYAMAN DI BANDUNG! Wa: 085168131704 For more info/WA link',
        }),
      ),
    ).toBe(true)
  })

  it('recognises a store from a shop address or order line in the bio', () => {
    expect(looksLikeBusiness(profile({ bio: 'Official ROG Store Bandung BEC Lt 1 AC 03/05' }))).toBe(true)
    expect(looksLikeBusiness(profile({ bio: 'Order via WA 081281917283, buka 13.00-03.00' }))).toBe(true)
  })

  it('does not mistake an ordinary creator for a shop', () => {
    expect(looksLikeBusiness(profile({ handle: 'audrisw98', displayName: 'Audrisw', bio: 'Kulineran di Bandung' }))).toBe(false)
    // "toko" appearing as a topic is not the same as being one.
    expect(looksLikeBusiness(profile({ handle: 'reviewjujur', bio: 'review jajanan di toko sebelah' }))).toBe(false)
  })

  it('ranks a shop below a creator with the same numbers', () => {
    const creator = scoreResult(perf(), null, [])
    const shop = scoreResult(perf(), null, [{ kind: 'warn', code: 'business', message: '' }])
    expect(shop).toBeLessThan(creator)
  })

  it('flags a shop so the reader can tell at a glance', () => {
    const flags = buildFlags(
      profile({ handle: 'rogstorebdg', displayName: 'ROG Store Bandung' }),
      'nano', perf(), noRegion, null, { business: true },
    )
    expect(flags.some((f) => f.code === 'business')).toBe(true)
  })
})

describe('accounts too small to endorse anything', () => {
  it('rejects an account with a handful of followers', () => {
    // A real row from the live search: 3 followers, offered as a KOL.
    expect(isTooSmallToUse(profile({ followers: 3 }))).toBe(true)
    expect(isTooSmallToUse(profile({ followers: 300 }))).toBe(true)
  })

  it('keeps a genuine nano creator', () => {
    expect(isTooSmallToUse(profile({ followers: 1_200 }))).toBe(false)
    expect(isTooSmallToUse(profile({ followers: 9_000 }))).toBe(false)
  })

  it('never rejects an account whose follower count could not be read', () => {
    // Unknown is not the same as tiny, and the distinction has been the whole
    // discipline of this feature.
    expect(isTooSmallToUse(profile({ followers: null }))).toBe(false)
  })
})

describe('an off-topic creator is never a match', () => {
  // The split between "cocok" and "mendekati" was decided by tier alone, so a
  // dead account with 0 of 18 posts on topic sat in the matched section as the
  // single result — purely for being the right size — while creators with 18 of
  // 20 on topic were filed below it as near misses.
  it('marks a zero-relevance creator as missed regardless of tier', () => {
    expect(missedReason({ matched: 0, total: 18 }, true, true)).toBe('off-topic')
  })

  it('leaves a relevant creator in the matched section', () => {
    expect(missedReason({ matched: 12, total: 13 }, true, true)).toBeNull()
  })

  it('does not invent a relevance verdict when the classifier never ran', () => {
    // niche null means "not judged", which must not read as "judged irrelevant".
    expect(missedReason(null, true, true)).toBeNull()
  })

  it('still reports region and activity misses ahead of relevance', () => {
    expect(missedReason({ matched: 0, total: 18 }, false, true)).toBe('activity')
  })
})
