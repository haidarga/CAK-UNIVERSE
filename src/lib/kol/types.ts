import type { KolTier } from '@/lib/kol/tiers'
import type { RegionDetection } from '@/lib/kol/region-detect'

// KOL Finder — shared shapes.
//
// Same trust-layering discipline as Strategist Mode, because the failure it
// prevents is the same one: a number that was guessed rendering exactly like a
// number that was measured. Each layer below is a different kind of claim.
//
//   KolCandidate  → who we found, and how. Discovery only, no judgement.
//   KolProfile    → MEASURED public stats. Real numbers from the provider.
//   KolPerformance→ DERIVED from an unbiased recent-post sample. Deterministic.
//   KolNiche      → INFERRED by an LLM from bio + captions. Always labelled.
//   KolResult     → all of the above, plus the filters it passed.

export type KolPlatform = 'tiktok' | 'instagram'

/** Which discovery path surfaced this handle. Kept because it predicts quality. */
export type KolSource = 'hashtag' | 'keyword-video' | 'keyword-user'

export interface KolCandidate {
  handle: string
  sources: KolSource[]
  /** Videos of theirs seen during discovery. NOT a performance sample — see enrich.ts. */
  seenVideos: {
    videoId?: string | null
    url?: string | null
    caption?: string | null
    playCount?: number | null
    diggCount?: number | null
    commentCount?: number | null
    createTimeIso?: string | null
    region?: string | null
  }[]
}

/** Measured account facts. Every field here came from the provider verbatim. */
export interface KolProfile {
  handle: string
  displayName: string | null
  bio: string | null
  followers: number | null
  following: number | null
  totalVideos: number | null
  totalHearts: number | null
  /** ISO country code. Country ONLY — the provider has no province data. */
  country: string | null
  verified: boolean
  isPrivate: boolean
  avatarUrl: string | null
  /** Linked Instagram handle, when the creator published one. */
  instagramHandle: string | null
  profileUrl: string
}

/**
 * Performance derived from a creator's OWN recent feed.
 *
 * Deliberately not derived from the hashtag feed. Measured live: an account
 * whose single hashtag video had gone viral scored 615% "engagement" there while
 * its actual recent feed averaged 663 views, 8 likes, and it had not posted in
 * sixteen months.
 */
export interface KolPerformance {
  sampleSize: number
  avgViews: number | null
  avgLikes: number | null
  avgComments: number | null
  /**
   * Likes ÷ views, as a percentage.
   *
   * Views, not followers, because TikTok reach comes from the For You feed: a
   * 56k-follower account routinely pulls a million views, which makes any
   * follower-based ratio produce impossible figures like 66%.
   */
  engagementRate: number | null
  lastPostAt: string | null
  daysSinceLastPost: number | null
  /** Median gap between posts, in days. Null when the sample is too thin. */
  postingCadenceDays: number | null
}

export interface KolNiche {
  /** How many sampled posts read as on-topic for the search. */
  matched: number
  total: number
  /** Short label the model assigned, e.g. "Skincare & beauty review". */
  label: string | null
  reason: string | null
}

/** Why an account is worth a second look, or worth skipping. Shown verbatim in the UI. */
export interface KolFlag {
  kind: 'good' | 'warn'
  code:
    | 'dormant' | 'low-engagement' | 'high-engagement' | 'thin-sample' | 'private'
    | 'unresolved-region' | 'consistent' | 'occasional' | 'low-volume'
    | 'off-tier' | 'unknown-country'
  message: string
}

export interface KolResult {
  platform: KolPlatform
  /**
   * Set when this row did NOT pass a filter but is shown anyway.
   *
   * A stack of narrow filters lands on zero results routinely, and an empty
   * screen tells the reader nothing about how close they were. These rows are
   * fully measured — only region and activity rejects qualify, because those
   * filters run after enrichment — and the UI labels them plainly so nobody
   * mistakes a near miss for a match.
   */
  missed?: 'region' | 'activity' | null
  /** Did this creator's size match the requested tier? Ranks, never excludes. */
  tierMatch?: boolean
  candidate: KolCandidate
  profile: KolProfile
  tier: KolTier | null
  region: RegionDetection
  performance: KolPerformance | null
  niche: KolNiche | null
  flags: KolFlag[]
  /** 0–100, for default ordering. Composite and explicitly non-authoritative. */
  score: number
}

export interface KolSearchInput {
  platform: KolPlatform
  /** Free text: a hashtag, a keyword, or several separated by commas. */
  query: string
  tiers: KolTier[]
  /** Region id from REGIONS, an island name, or null for anywhere in Indonesia. */
  region: string | null
  /** ISO country filter. Defaults to ID; null means do not filter. */
  country: string | null
  /** Drop accounts that have not posted within this many days. */
  maxDaysInactive: number | null
  /** How hard to dig. More pages, more candidates, more time. */
  depth: 'cepat' | 'standar' | 'dalam'
}

export interface KolSearchMeta {
  query: string
  hashtagsUsed: string[]
  keywordsUsed: string[]
  candidatesFound: number
  resolved: number
  /** Dropped BEFORE the expensive stage. Broken down below, never silent. */
  filteredOut: number
  droppedByCountry: number
  /** Dropped during discovery from the free per-video country field, before any lookup. */
  droppedForeignEarly: number
  droppedByTier: number
  /** Matched everything else but had no readable follower count, so no tier. */
  droppedNoFollowers: number
  /** Which tiers the tier-rejects sat in, so the reader knows what widening buys. */
  tierSpread: Record<string, number>
  /** Dropped AFTER measurement, by region. These are fully measured accounts. */
  droppedByRegion: number
  /** Dropped AFTER measurement, for being dormant. Also fully measured. */
  droppedByActivity: number
  enriched: number
  fromCache: number
  elapsedMs: number
  /** Set when a hard cap truncated the sweep, so the UI can say so out loud. */
  truncated: string | null
  warnings: string[]
}

export interface KolSearchResponse {
  results: KolResult[]
  /** Everything resolved this sweep, for the cache — including filtered-out rows. */
  resolvedProfiles: KolProfile[]
  meta: KolSearchMeta
}
