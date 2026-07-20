import type { SupabaseClient } from '@supabase/supabase-js'
import { parseAccountUrl } from '@/lib/cakgpt/strategist/url'
import { scrapeAccount, ScraperError } from '@/lib/cakgpt/strategist/scraper'
import { computeMetrics } from '@/lib/cakgpt/strategist/metrics'
import { analyzeAccount } from '@/lib/cakgpt/strategist/analysis'
import { CacheRowSchema } from '@/lib/cakgpt/strategist/schemas'
import type {
  Platform,
  ScrapedAccount,
  AccountMetrics,
  StrategistEstimate,
  StrategistReport,
} from '@/lib/cakgpt/strategist/types'

// Orchestrator: URL → cache-or-fetch → report. The cache is the reason this
// stays inside a ~100-call/month free scraper tier — a repeat lookup of the
// same account within the TTL costs zero scraper and zero LLM calls.

function posNum(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const CACHE_TTL_HOURS = posNum(process.env.STRATEGIST_CACHE_TTL_HOURS, 24)
// Hard floor on how often the SAME account can be re-scraped, even with
// force_refresh. This is what closes the "loop force_refresh:true to burn the
// free quota + LLM cost" vector — a forced refresh within this window is a
// no-op that serves cache. (A full per-user rate limiter is still recommended
// before heavy multi-user load; this floor covers the specific abuse path.)
const MIN_REFRESH_MINUTES = posNum(process.env.STRATEGIST_MIN_REFRESH_MINUTES, 15)

export type AnalyzeResult =
  | { ok: true; report: StrategistReport }
  | { ok: false; error: string; status: number }

type CacheRow = {
  scraped: ScrapedAccount
  metrics: AccountMetrics
  estimate: StrategistEstimate
  provider: string | null
  model: string | null
  fetched_at: string
  url: string
}

function isStale(fetchedAtIso: string): boolean {
  const ageMs = Date.now() - Date.parse(fetchedAtIso)
  return !(ageMs >= 0 && ageMs < CACHE_TTL_HOURS * 60 * 60 * 1000)
}

function assembleReport(args: {
  url: string
  account: ScrapedAccount
  metrics: AccountMetrics
  estimate: StrategistEstimate
  provider: string
  model: string | null
  fetchedAt: string
  cached: boolean
}): StrategistReport {
  const { account, metrics, estimate } = args
  return {
    account: {
      platform: account.platform,
      handle: account.handle,
      displayName: account.displayName ?? null,
      avatarUrl: account.avatarUrl ?? null,
      verified: account.verified ?? false,
      followers: metrics.followers,
      url: args.url,
    },
    metrics,
    estimate,
    meta: {
      scrapedAt: account.scrapedAt,
      analyzedAt: args.fetchedAt,
      cached: args.cached,
      provider: args.provider,
      model: args.model,
    },
  }
}

// Reads + VALIDATES the cache row. A DB error or a row written in a stale/
// corrupt shape (older code, hand-edit) returns null → the caller falls through
// to a fresh scrape instead of trusting an unvalidated cast and throwing later.
async function readCache(
  supabase: SupabaseClient,
  userId: string,
  clientId: string | null,
  platform: Platform,
  handle: string,
): Promise<CacheRow | null> {
  const base = supabase
    .from('strategist_accounts')
    .select('scraped, metrics, estimate, provider, model, fetched_at, url')
    .eq('created_by', userId)
    .eq('platform', platform)
    .eq('handle', handle)
  // Scope to the active workspace; NULL client_id is the "All clients" bucket.
  const { data, error } = await (clientId ? base.eq('client_id', clientId) : base.is('client_id', null)).maybeSingle()

  if (error) {
    console.error('[strategist] cache read failed:', error.message)
    return null
  }
  if (!data) return null

  const parsed = CacheRowSchema.safeParse(data)
  if (!parsed.success) {
    console.error('[strategist] invalid cache row, re-scraping:', parsed.error.message)
    return null
  }
  return parsed.data as CacheRow
}

async function upsertCache(
  supabase: SupabaseClient,
  userId: string,
  clientId: string | null,
  row: {
    platform: Platform
    handle: string
    url: string
    account: ScrapedAccount
    metrics: AccountMetrics
    estimate: StrategistEstimate
    model: string | null
    fetchedAt: string
  },
): Promise<void> {
  // Non-fatal: a failed cache write shouldn't fail the user's request (they
  // already have their result) — it just means the next lookup re-scrapes.
  const { error } = await supabase.from('strategist_accounts').upsert(
    {
      created_by: userId,
      client_id: clientId,
      platform: row.platform,
      handle: row.handle,
      url: row.url,
      scraped: row.account,
      metrics: row.metrics,
      estimate: row.estimate,
      provider: row.account.provider,
      model: row.model,
      fetched_at: row.fetchedAt,
    },
    { onConflict: 'created_by,client_id,platform,handle' },
  )
  if (error) console.error('[strategist] cache upsert failed:', error.message)
}

export async function analyzeAccountUrl(params: {
  supabase: SupabaseClient
  userId: string
  url: string
  clientId?: string | null
  forceRefresh?: boolean
  sampleSize?: number
}): Promise<AnalyzeResult> {
  const clientId = params.clientId ?? null
  const parsed = parseAccountUrl(params.url)
  if (!parsed.ok) return { ok: false, error: parsed.error, status: 400 }
  const { platform, handle, normalizedUrl } = parsed

  // 1. Reuse the cached SCRAPE when fresh (or within the refresh floor on a
  // forced refresh). The chosen sample size only affects downstream metrics, so
  // switching sizes recomputes from this cached scrape — it never re-scrapes.
  const cached = await readCache(params.supabase, params.userId, clientId, platform, handle)
  const useCachedScrape =
    !!cached &&
    (!params.forceRefresh
      ? !isStale(cached.fetched_at)
      : Date.now() - Date.parse(cached.fetched_at) < MIN_REFRESH_MINUTES * 60 * 1000)

  let account: ScrapedAccount
  let scrapeFromCache = false
  let fetchedAt: string
  if (useCachedScrape && cached) {
    account = cached.scraped
    scrapeFromCache = true
    fetchedAt = cached.fetched_at
  } else {
    try {
      account = await scrapeAccount(platform, handle)
    } catch (e) {
      if (e instanceof ScraperError) return { ok: false, error: e.message, status: 422 }
      console.error('[strategist] unexpected scrape error:', e instanceof Error ? e.message : e)
      return { ok: false, error: 'Terjadi kesalahan tak terduga. Coba lagi nanti.', status: 500 }
    }
    fetchedAt = new Date().toISOString()
  }

  // 2. Metrics over the chosen sample size, then the AI estimate. Both are cheap
  // and run every request so the dropdown reflects instantly without a re-scrape.
  const metrics = computeMetrics(account, params.sampleSize)

  let estimate: StrategistEstimate
  let model: string | null
  try {
    const res = await analyzeAccount(params.supabase, params.userId, account, metrics)
    estimate = res.estimate
    model = res.model
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Analisis gagal.', status: 502 }
  }

  // 3. Persist the raw scrape only when we actually scraped (1 row per account).
  if (!scrapeFromCache) {
    await upsertCache(params.supabase, params.userId, clientId, {
      platform, handle, url: normalizedUrl, account, metrics, estimate, model, fetchedAt,
    })
  }

  return {
    ok: true,
    report: assembleReport({
      url: normalizedUrl, account, metrics, estimate,
      provider: account.provider, model, fetchedAt, cached: scrapeFromCache,
    }),
  }
}
