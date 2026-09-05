import { tierEngagementFloor } from '@/lib/kol/tiers'
import type { KolFlag, KolNiche, KolPerformance, KolProfile, KolResult } from '@/lib/kol/types'
import type { KolTier } from '@/lib/kol/tiers'
import type { RegionDetection } from '@/lib/kol/region-detect'

// Stage 4 — turn measurements into a ranking, and say why.
//
// The score exists only to give the table a sensible default order. It is
// explicitly not a verdict: every input that produced it is shown in its own
// column, so a human can disagree with the ordering and still see the evidence.
// A single opaque 0–100 that nobody can audit is how these tools start lying.

// Below this an account cannot carry a campaign no matter how good its ratios
// look. A live search offered a creator with THREE followers.
const MIN_USABLE_FOLLOWERS = 1_000

/** Too small to endorse anything. Unknown is never "too small" — only a read zero is. */
export function isTooSmallToUse(profile: KolProfile): boolean {
  return typeof profile.followers === 'number' && profile.followers < MIN_USABLE_FOLLOWERS
}

// Matched as SUBSTRINGS on purpose: a handle has no spaces, so "rogstorebdg"
// carries no word boundary around "store" and a bounded pattern would miss
// every shop handle there is.
const BUSINESS_WORDS =
  /(store|shop|olshop|official|toko|grosir|distributor|supplier|rental|servis|lounge|resto|restaurant|apotek|klinik)/i

// Shop-shaped bio signals: an order channel, a street address, opening hours.
const BIO_COMMERCE = /(whatsapp|\bwa\b|open ?order|pemesanan|melayani|free ongkir|\bcod\b|dijamin ori|jam buka|buka\s*\d)/i
const BIO_ADDRESS = /(jl\.|jalan\s+[a-z]|ruko|lantai|\blt\.?\s*\d|\bbec\b|mall|plaza|blok\s)/i
const BIO_PHONE = /\d{9,}/

/**
 * Does this account read as a business rather than a person?
 *
 * Shops post the content and use the hashtags, so the niche classifier calls
 * them consistent — but a store is not somebody you can brief. A live search for
 * "gaming" in Bandung returned ROG Store, Sj Playstation and Futbol Lounge as
 * its best creators.
 *
 * They are labelled, never removed: sometimes a local brand IS the target.
 *
 * A business word in the NAME decides it alone — "ROG Store Bandung" is not
 * ambiguous. A bio needs TWO independent signals, because "review jajanan di
 * toko sebelah" mentions a shop without being one.
 */
export function looksLikeBusiness(profile: KolProfile): boolean {
  if (BUSINESS_WORDS.test(`${profile.handle} ${profile.displayName ?? ''}`)) return true
  const bio = profile.bio ?? ''
  const hits = [BUSINESS_WORDS, BIO_COMMERCE, BIO_ADDRESS, BIO_PHONE].filter((re) => re.test(bio)).length
  return hits >= 2
}

const DORMANT_DAYS = 60
const VERY_DORMANT_DAYS = 180
const THIN_SAMPLE = 5

// Below this many average views, a like ratio is arithmetic without meaning.
// Observed live on Instagram: an 805-follower account averaging 11 views and 3
// likes scores 27.3% engagement and would out-rank every serious creator in the
// list. The ratio is correct; it is the sample that is too small to say
// anything, and a headline percentage hides that completely.
const MIN_MEANINGFUL_VIEWS = 200

/** Is this engagement rate built on enough reach to mean anything? */
export function engagementIsMeaningful(performance: KolPerformance | null): boolean {
  if (!performance || performance.engagementRate === null) return false
  return performance.avgViews !== null && performance.avgViews >= MIN_MEANINGFUL_VIEWS
}

export function buildFlags(
  profile: KolProfile,
  tier: KolTier | null,
  performance: KolPerformance | null,
  region: RegionDetection,
  niche: KolNiche | null,
  opts: { tierMatch?: boolean; wantedCountry?: string | null; suppressRegionFlag?: boolean; business?: boolean } = {},
): KolFlag[] {
  const flags: KolFlag[] = []

  if (opts.business) {
    flags.push({ kind: 'warn', code: 'business', message: 'Kelihatannya akun toko/brand, bukan kreator perorangan' })
  }

  if (opts.tierMatch === false) {
    flags.push({ kind: 'warn', code: 'off-tier', message: `Bukan tier yang kamu minta — ini ${tier ?? 'ukuran gak kebaca'}` })
  }

  // A missing country used to pass the Indonesia filter in silence, so foreign
  // creators whose metadata happened to be blank arrived looking like local
  // ones. Unknown is now said out loud rather than treated as a match.
  if (opts.wantedCountry && !profile.country) {
    flags.push({ kind: 'warn', code: 'unknown-country', message: 'Negaranya gak kebaca — belum tentu Indonesia' })
  }

  if (profile.isPrivate) {
    flags.push({ kind: 'warn', code: 'private', message: 'Akun private — konten gak kebaca publik' })
  }

  const days = performance?.daysSinceLastPost
  if (typeof days === 'number') {
    if (days >= VERY_DORMANT_DAYS) {
      flags.push({ kind: 'warn', code: 'dormant', message: `Gak posting ${Math.floor(days / 30)} bulan — kemungkinan besar akun mati` })
    } else if (days >= DORMANT_DAYS) {
      flags.push({ kind: 'warn', code: 'dormant', message: `Terakhir posting ${days} hari lalu` })
    }
  }

  if (performance) {
    if (performance.sampleSize > 0 && performance.sampleSize < THIN_SAMPLE) {
      flags.push({ kind: 'warn', code: 'thin-sample', message: `Cuma ${performance.sampleSize} post buat diukur — angkanya belum stabil` })
    }
    const er = performance.engagementRate
    if (er !== null && !engagementIsMeaningful(performance)) {
      flags.push({
        kind: 'warn',
        code: 'low-volume',
        message: `Engagement ${er}% cuma dari rata-rata ${performance.avgViews ?? 0} view — angkanya belum berarti apa-apa`,
      })
    } else if (er !== null) {
      const floor = tierEngagementFloor(tier)
      if (er >= floor * 1.5) {
        flags.push({ kind: 'good', code: 'high-engagement', message: `Engagement ${er}% — di atas rata-rata tier ${tier ?? '-'}` })
      } else if (er < floor * 0.4) {
        // Deliberately phrased as a question, not an accusation. Low
        // like-per-view has honest causes — heavy save/share content, or a
        // niche that watches without tapping.
        flags.push({ kind: 'warn', code: 'low-engagement', message: `Engagement ${er}% — rendah buat tier ini, cek manual sebelum dipakai` })
      }
    }
  }

  if (niche && niche.total > 0) {
    const ratio = niche.matched / niche.total
    if (ratio >= 0.6) flags.push({ kind: 'good', code: 'consistent', message: `Konsisten di niche ini (${niche.matched}/${niche.total} post)` })
    else if (ratio < 0.3) flags.push({ kind: 'warn', code: 'occasional', message: `Cuma ${niche.matched} dari ${niche.total} post yang nyambung — kayaknya kebetulan lewat` })
  }

  if (!region.area && !opts.suppressRegionFlag) {
    flags.push({ kind: 'warn', code: 'unresolved-region', message: region.evidence || 'Lokasi gak ketebak' })
  } else if (region.area && region.confidence === 'rendah' && region.alternates.length) {
    // A weak win is still shown, but never as if it were settled.
    flags.push({ kind: 'warn', code: 'unresolved-region', message: `Lokasi kurang yakin — juga nyebut ${region.alternates.length} daerah lain` })
  }

  return flags
}

/**
 * Composite 0–100 for default ordering.
 *
 * Weighted toward things we MEASURED (activity, engagement, niche consistency)
 * and away from follower count, because raw size is the one thing Jul can
 * already see at a glance and the one that correlates worst with campaign
 * performance.
 */
export function scoreResult(
  performance: KolPerformance | null,
  niche: KolNiche | null,
  flags: KolFlag[],
): number {
  // RELEVANCE COMES FIRST, and it is close to a veto.
  //
  // The old order put tier match above everything, so a live search for "gaming"
  // returned an account with 0 of 18 posts on topic, dormant 67 days, at rank
  // one — purely because it sat in the requested follower bracket — while a
  // creator with 12 of 13 on topic, posting two days ago, was pushed below it
  // for being one tier smaller.
  //
  // Someone who does not make the content being searched for is not a candidate
  // at any size, in any city. Everything else is a modifier on top of that.
  let score = 50

  // Set when the creator makes NONE of the searched content. Being active and
  // well-engaged at the wrong topic is not a virtue, so the bonuses below are
  // capped rather than allowed to lift an irrelevant account back up the list.
  let irrelevant = false

  if (niche && niche.total > 0) {
    const ratio = niche.matched / niche.total
    if (ratio === 0) {
      score -= 45
      irrelevant = true
    }
    else if (ratio < 0.3) score -= 25
    else if (ratio < 0.6) score += 4
    else if (ratio < 0.85) score += 16
    else score += 24
  }

  const days = performance?.daysSinceLastPost
  if (typeof days === 'number') {
    if (days <= 7) score += 18
    else if (days <= 30) score += 10
    else if (days <= 60) score += 2
    else if (days <= 180) score -= 18
    else score -= 32
  } else {
    // Unmeasurable activity is a real gap, not a neutral one.
    score -= 8
  }

  // A high ratio off a handful of views must not out-rank a real creator, so the
  // engagement bonus is only paid when the sample can carry it.
  const er = engagementIsMeaningful(performance) ? performance!.engagementRate : null
  if (er !== null && er !== undefined) {
    if (er >= 6) score += 16
    else if (er >= 3) score += 10
    else if (er >= 1.5) score += 4
    else if (er < 0.5) score -= 10
  }

  // Ranked down, not removed. An off-tier creator is still a real creator in the
  // right niche, and hiding them entirely is what produced blank screens. The
  // penalty is deliberately smaller than the relevance one: the wrong size is a
  // preference, the wrong topic is a disqualification.
  if (flags.some((f) => f.code === 'off-tier')) score -= 12
  if (flags.some((f) => f.code === 'unknown-country')) score -= 10
  // A shop can be exactly what a campaign wants, so this is a nudge, not a veto.
  if (flags.some((f) => f.code === 'business')) score -= 14
  if (performance && performance.sampleSize > 0 && performance.sampleSize < THIN_SAMPLE) score -= 6
  if (flags.some((f) => f.code === 'private')) score -= 20

  const bounded = Math.max(0, Math.min(100, Math.round(score)))
  // A creator with zero on-topic posts can never out-rank one who is merely
  // weak on topic, whatever their activity or engagement.
  return irrelevant ? Math.min(bounded, 20) : bounded
}

/**
 * Which single filter, if any, keeps this creator out of the matched section.
 *
 * Relevance belongs here, not only in the score. The split used to be decided by
 * tier alone, so a dormant account with 0 of 18 posts on topic sat in "cocok" as
 * the only result — purely for being the right size — while creators with 18 of
 * 20 on topic were filed underneath as near misses.
 *
 * Order matters: a creator who has gone quiet or lives elsewhere is reported as
 * such first, because those are the filters the reader set deliberately.
 * `null` niche means the classifier never ran, which must never read as a
 * verdict of irrelevance.
 */
export function missedReason(
  niche: { matched: number; total: number } | null,
  passesActivity: boolean,
  passesRegion: boolean,
  regionKnown = true,
): 'activity' | 'region' | 'region-unknown' | 'off-topic' | null {
  if (!passesActivity) return 'activity'
  if (!passesRegion) return regionKnown ? 'region' : 'region-unknown'
  if (niche && niche.total > 0 && niche.matched === 0) return 'off-topic'
  return null
}

/** Default ordering: score first, then recency, then reach as the tiebreak. */
export function compareResults(a: KolResult, b: KolResult): number {
  if (b.score !== a.score) return b.score - a.score
  const aDays = a.performance?.daysSinceLastPost ?? Number.MAX_SAFE_INTEGER
  const bDays = b.performance?.daysSinceLastPost ?? Number.MAX_SAFE_INTEGER
  if (aDays !== bDays) return aDays - bDays
  return (b.profile.followers ?? 0) - (a.profile.followers ?? 0)
}
