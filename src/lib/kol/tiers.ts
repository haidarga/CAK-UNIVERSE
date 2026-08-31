// KOL tiers, exactly as the brief defined them.
//
// Boundaries are half-open [min, max) so an account with precisely 10.000
// followers lands in mikro and never in two buckets at once — the kind of
// off-by-one that turns "kenapa akun ini muncul di dua filter" into a bug
// report.
export const KOL_TIERS = [
  { id: 'nano', label: 'Nano', min: 0, max: 10_000, blurb: '0 – 10rb' },
  { id: 'mikro', label: 'Mikro', min: 10_000, max: 50_000, blurb: '10rb – 50rb' },
  { id: 'middle', label: 'Middle', min: 50_000, max: 100_000, blurb: '50rb – 100rb' },
  { id: 'makro', label: 'Makro', min: 100_000, max: 1_000_000, blurb: '100rb – 1jt' },
  { id: 'mega', label: 'Mega', min: 1_000_000, max: Infinity, blurb: '1jt ke atas' },
] as const

export type KolTier = (typeof KOL_TIERS)[number]['id']

export const KOL_TIER_IDS = KOL_TIERS.map((t) => t.id) as readonly KolTier[]

/** null in, null out — an unreadable follower count has no tier, and guessing one would be a lie. */
export function tierOf(followers: number | null | undefined): KolTier | null {
  if (typeof followers !== 'number' || !Number.isFinite(followers) || followers < 0) return null
  return KOL_TIERS.find((t) => followers >= t.min && followers < t.max)!.id
}

export function tierLabel(tier: KolTier | null): string {
  return KOL_TIERS.find((t) => t.id === tier)?.label ?? '—'
}

/**
 * Engagement that counts as strong FOR THIS TIER.
 *
 * A flat threshold is wrong: reach scales sublinearly with audience, so a mega
 * account at 3% is outperforming a nano at 5%. Measured live on TikTok skincare
 * accounts, likes-per-view sat around 1–5% regardless of size, but the realistic
 * ceiling drops as the audience grows. These are display bands, never filters.
 */
export function tierEngagementFloor(tier: KolTier | null): number {
  switch (tier) {
    case 'nano': return 4
    case 'mikro': return 3.5
    case 'middle': return 3
    case 'makro': return 2.5
    case 'mega': return 2
    default: return 3
  }
}
