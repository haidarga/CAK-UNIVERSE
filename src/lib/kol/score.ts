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
  opts: { tierMatch?: boolean; wantedCountry?: string | null; suppressRegionFlag?: boolean } = {},
): KolFlag[] {
  const flags: KolFlag[] = []

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
  let score = 50

  // Ranked down, not removed. A creator outside the requested tier is still a
  // real creator in the right niche, and hiding them entirely is what produced
  // blank screens.
  if (flags.some((f) => f.code === 'off-tier')) score -= 22
  if (flags.some((f) => f.code === 'unknown-country')) score -= 10

  const days = performance?.daysSinceLastPost
  if (typeof days === 'number') {
    if (days <= 7) score += 20
    else if (days <= 30) score += 12
    else if (days <= 60) score += 4
    else if (days <= 180) score -= 15
    else score -= 30
  } else {
    // Unmeasurable activity is a real gap, not a neutral one.
    score -= 8
  }

  // A high ratio off a handful of views must not out-rank a real creator, so the
  // engagement bonus is only paid when the sample can carry it.
  const er = engagementIsMeaningful(performance) ? performance!.engagementRate : null
  if (er !== null && er !== undefined) {
    if (er >= 6) score += 20
    else if (er >= 3) score += 12
    else if (er >= 1.5) score += 5
    else if (er < 0.5) score -= 12
  }

  if (niche && niche.total > 0) {
    score += Math.round((niche.matched / niche.total) * 20) - 5
  }

  if (performance && performance.sampleSize > 0 && performance.sampleSize < THIN_SAMPLE) score -= 6
  if (flags.some((f) => f.code === 'private')) score -= 20

  return Math.max(0, Math.min(100, Math.round(score)))
}

/** Default ordering: score first, then recency, then reach as the tiebreak. */
export function compareResults(a: KolResult, b: KolResult): number {
  if (b.score !== a.score) return b.score - a.score
  const aDays = a.performance?.daysSinceLastPost ?? Number.MAX_SAFE_INTEGER
  const bDays = b.performance?.daysSinceLastPost ?? Number.MAX_SAFE_INTEGER
  if (aDays !== bDays) return aDays - bDays
  return (b.profile.followers ?? 0) - (a.profile.followers ?? 0)
}
