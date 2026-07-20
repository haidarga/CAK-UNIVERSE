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
  takenAt?: string | null // ISO-8601, used to derive posting cadence
  caption?: string | null
}

export interface ScrapedAccount {
  platform: Platform
  handle: string
  displayName?: string | null
  bio?: string | null
  followers: number
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
  followers: number
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
    followers: number
    url: string
  }
  metrics: AccountMetrics
  estimate: StrategistEstimate
  meta: {
    scrapedAt: string
    analyzedAt: string
    cached: boolean // true = served from cache, no scraper/LLM call this request
    provider: string
    model: string | null
  }
}

// A scraper adapter. Swappable by design so a dead/blocked free-tier provider
// can be replaced without touching the orchestrator (see scraper.ts).
export interface ScraperProvider {
  name: string
  scrape(platform: Platform, handle: string): Promise<ScrapedAccount>
}
