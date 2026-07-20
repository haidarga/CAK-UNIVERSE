import { z } from 'zod'

// Runtime contracts for the whole Strategist pipeline. These exist so nothing
// crosses a trust boundary un-validated: LLM output, jsonb read back from the
// cache (which an older code version or a hand-edit could have written in a
// stale shape), and the API response the client renders. tsc can't see any of
// those shapes — Zod is the actual enforcement, same philosophy as llm.ts.

const PlatformSchema = z.enum(['tiktok', 'instagram'])

export const ScrapedPostSchema = z.object({
  id: z.string().nullish(),
  views: z.number().nullish(),
  // likes/comments are nullable: "provider didn't return this field" must stay
  // distinguishable from "measured zero" so the average can exclude it instead
  // of fabricating a 0 that deflates real "Data Aktual" numbers.
  likes: z.number().nullable(),
  comments: z.number().nullable(),
  shares: z.number().nullish(),
  saves: z.number().nullish(),
  takenAt: z.string().nullish(),
  caption: z.string().nullish(),
})

export const ScrapedAccountSchema = z.object({
  platform: PlatformSchema,
  handle: z.string(),
  displayName: z.string().nullish(),
  bio: z.string().nullish(),
  followers: z.number(),
  following: z.number().nullish(),
  totalPosts: z.number().nullish(),
  verified: z.boolean().optional(),
  avatarUrl: z.string().nullish(),
  recentPosts: z.array(ScrapedPostSchema),
  scrapedAt: z.string(),
  provider: z.string(),
})

export const AccountMetricsSchema = z.object({
  followers: z.number(),
  postsAnalyzed: z.number(),
  avgViews: z.number().nullable(),
  avgLikes: z.number().nullable(),
  avgComments: z.number().nullable(),
  avgShares: z.number().nullable(),
  engagementRatePct: z.number(),
  engagementBasis: z.enum(['views', 'followers']),
  postsPerWeek: z.number().nullable(),
})

const RangeSchema = z
  .object({ low: z.number().nonnegative(), high: z.number().nonnegative() })
  // Repair an inverted range from the model instead of rejecting the whole result.
  .transform((r) => (r.low <= r.high ? r : { low: r.high, high: r.low }))

export const StrategistEstimateSchema = z.object({
  niche: z.string().min(1).max(80),
  region: z.string().min(1).max(80),
  audience_tier: z.string().min(1).max(40),
  est_cpm_idr: RangeSchema,
  est_cpc_idr: RangeSchema,
  est_ctr_pct: RangeSchema,
  est_rate_per_post_idr: RangeSchema,
  confidence: z.enum(['low', 'medium', 'high']),
  reasoning: z.object({
    cpm: z.string().min(1).max(600),
    cpc: z.string().min(1).max(600),
    ctr: z.string().min(1).max(600),
    rate: z.string().min(1).max(600),
  }),
  brief_insight: z.string().min(1).max(1200),
})

// The exact row shape read back from strategist_accounts (jsonb columns + meta).
export const CacheRowSchema = z.object({
  scraped: ScrapedAccountSchema,
  metrics: AccountMetricsSchema,
  estimate: StrategistEstimateSchema,
  provider: z.string().nullable(),
  model: z.string().nullable(),
  fetched_at: z.string(),
  url: z.string(),
})

// The API response shape the client validates before rendering — keeps the
// green "Data Aktual" section from ever showing undefined/NaN on schema drift.
export const StrategistReportSchema = z.object({
  account: z.object({
    platform: PlatformSchema,
    handle: z.string(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    verified: z.boolean(),
    followers: z.number(),
    url: z.string(),
  }),
  metrics: AccountMetricsSchema,
  estimate: StrategistEstimateSchema,
  meta: z.object({
    scrapedAt: z.string(),
    analyzedAt: z.string(),
    cached: z.boolean(),
    provider: z.string(),
    model: z.string().nullable(),
  }),
})
