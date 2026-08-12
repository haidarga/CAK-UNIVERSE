// Strategist Mode — shared shapes. Three layers, deliberately separate because
// they carry different trust levels and that separation is the whole point of
// the feature's "honesty" requirement:
//
//   ScrapedAccount   → REAL public data pulled from a scraper adapter.
//   AccountMetrics   → DERIVED from ScrapedAccount by pure, deterministic math.
//   StrategistEstimate → INFERRED by an LLM. Explicitly "estimasi", never shown
//                        as if it were measured.
//
// StrategistReport bundles all three (+ meta) for the API/UI and the jsonb cache.

export type Platform = 'tiktok' | 'instagram'

// Which slice of an Instagram account to measure. Chosen by the pasted URL:
// .../username/reels/ asks for Reels only, a bare profile URL for everything.
// TikTok is video-only, so this never applies there.
export type FeedScope = 'all' | 'reels'

// ── Layer 1: real scraped data (normalized across providers) ─────────────────
export interface ScrapedPost {
  id?: string | null
  // TikTok exposes per-video plays; Instagram feed posts usually don't, so
  // `views` is nullable and metrics fall back to a followers-based reach.
  views?: number | null
  // Nullable on purpose: a provider field-name mismatch must read as "unknown"
  // (excluded from the average) rather than a measured 0 that quietly deflates
  // the real "Data Aktual" numbers.
  likes: number | null
  comments: number | null
  shares?: number | null
  saves?: number | null
  // Instagram mixes photos into the same feed as Reels, and a photo has no
  // play count — averaging it in as 0 views understates a Reels account by
  // roughly a quarter (measured: 13,316 vs 17,755 on a real account). Null when
  // the provider does not say, in which case nothing is filtered.
  isVideo?: boolean | null
  takenAt?: string | null // ISO-8601, used to derive posting cadence
  caption?: string | null
}

export interface ScrapedAccount {
  platform: Platform
  handle: string
  displayName?: string | null
  bio?: string | null
  // null when the provider could not read it. Deliberately NOT 0 — a real 0
  // and an unreadable field mean opposite things, and the second must never
  // render as a measured number.
  followers: number | null
  following?: number | null
  totalPosts?: number | null
  verified?: boolean
  avatarUrl?: string | null
  recentPosts: ScrapedPost[]
  scrapedAt: string // ISO-8601
  provider: string // adapter name that produced this record
}

// ── Layer 2: deterministic derived metrics ───────────────────────────────────
export interface AccountMetrics {
  followers: number | null
  postsAnalyzed: number
  // All averages are null when no post carried a usable value for that metric,
  // so the UI shows "N/A" instead of a fabricated 0.
  avgViews: number | null // typically null when the platform hides views (IG)
  avgLikes: number | null
  avgComments: number | null
  avgShares: number | null
  // Engagement uses avgViews as reach when available, else followers. We record
  // which basis was used so the UI can be honest about it.
  engagementRatePct: number
  engagementBasis: 'views' | 'followers'
  postsPerWeek: number | null // null when we can't date the posts
}

// ── Layer 3: LLM-inferred strategic estimate (clearly "estimasi") ────────────
export interface RangeIDR {
  low: number
  high: number
}

export type Confidence = 'low' | 'medium' | 'high'

export interface StrategistEstimate {
  niche: string
  region: string
  audience_tier: string // nano / micro / mid / macro
  est_cpm_idr: RangeIDR
  est_cpc_idr: RangeIDR
  est_ctr_pct: RangeIDR
  est_rate_per_post_idr: RangeIDR
  confidence: Confidence
  reasoning: {
    cpm: string
    cpc: string
    ctr: string
    rate: string
  }
  brief_insight: string // one-paragraph human summary to paste into a brief
}

// ── The bundle returned by the orchestrator + stored in the jsonb cache ──────
export interface StrategistReport {
  account: {
    platform: Platform
    handle: string
    displayName: string | null
    avatarUrl: string | null
    verified: boolean
    followers: number | null
    url: string
  }
  metrics: AccountMetrics
  estimate: StrategistEstimate
  meta: {
    scrapedAt: string
    analyzedAt: string
    cached: boolean // true = served from cache, no scraper/LLM call this request
    provider: string
    // Which slice was measured — 'reels' when the pasted URL asked for it.
    feed: FeedScope
    model: string | null
  }
}

// A scraper adapter. Swappable by design so a dead/blocked free-tier provider
// can be replaced without touching the orchestrator (see scraper.ts).
export interface ScraperProvider {
  name: string
  scrape(platform: Platform, handle: string): Promise<ScrapedAccount>
}
