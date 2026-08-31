import { discoverCandidates, parseQuery } from '@/lib/kol/discover'
import { resolveHandles } from '@/lib/kol/resolve'
import { enrichHandles } from '@/lib/kol/enrich'
import { classifyNiches } from '@/lib/kol/niche'
import { buildFlags, compareResults, scoreResult } from '@/lib/kol/score'
import { guessRegionFromBio, regionMatches } from '@/lib/kol/regions'
import { tierOf } from '@/lib/kol/tiers'
import type { KolProfile, KolResult, KolSearchInput, KolSearchResponse } from '@/lib/kol/types'

// The pipeline. Four stages, in a deliberate order.
//
// The ordering is the whole design. Stage 3 (enrich) costs one API call per
// creator and stage 4 (niche) costs one LLM call, so both run ONLY on accounts
// that already survived the cheap filters in stage 2. Filtering after enrichment
// instead would have measured ~60 accounts to show ~12 — five times the work for
// the same table.
//
// Everything a filter discards is counted and reported in `meta`. A tool that
// silently drops results reads as "this niche only has 12 creators" when the
// truth is "we looked at 61 and 49 did not match", and those are very different
// answers for someone planning a campaign.

const DEPTH_SETTINGS = {
  cepat: { pagesPerHashtag: 2, pagesPerKeyword: 1, maxCandidates: 40, maxEnrich: 20 },
  standar: { pagesPerHashtag: 5, pagesPerKeyword: 2, maxCandidates: 90, maxEnrich: 40 },
  dalam: { pagesPerHashtag: 10, pagesPerKeyword: 4, maxCandidates: 180, maxEnrich: 70 },
} as const

/**
 * Stages, in execution order, for the progress reporter.
 *
 * A full sweep takes around a minute and a half. An opaque spinner for that long
 * reads as a hang, and the honest fix is to say what is actually happening —
 * these events are emitted from the real stage boundaries, not from a timer.
 */
export type KolProgressStage = 'discover' | 'resolve' | 'filter' | 'enrich' | 'niche' | 'done'

export interface KolProgressEvent {
  stage: KolProgressStage
  /** Indonesian, user-facing, and specific — "61 akun ketemu", not "Loading…". */
  message: string
  current?: number
  total?: number
}

export interface SearchDeps {
  /** Previously scraped profiles, keyed by handle. Skips the resolve call. */
  cachedProfiles?: Map<string, KolProfile>
  /** Turn off the LLM niche pass — used by tests and by the cheap depth setting. */
  classifyNiche?: boolean
  onProgress?: (event: KolProgressEvent) => void
  now?: number
}

export async function runKolSearch(input: KolSearchInput, deps: SearchDeps = {}): Promise<KolSearchResponse> {
  const startedAt = Date.now()
  const depth = DEPTH_SETTINGS[input.depth] ?? DEPTH_SETTINGS.standar
  const { hashtags, keywords } = parseQuery(input.query)
  const warnings: string[] = []
  const report = deps.onProgress ?? (() => {})

  if (!hashtags.length && !keywords.length) {
    return {
      results: [],
      meta: {
        query: input.query, hashtagsUsed: [], keywordsUsed: [], candidatesFound: 0, resolved: 0,
        filteredOut: 0, enriched: 0, fromCache: 0, elapsedMs: 0, truncated: null,
        warnings: ['Kata kunci kosong.'],
      },
    }
  }

  // ── Stage 1: discover ──────────────────────────────────────────────────────
  report({ stage: 'discover', message: hashtags.length ? `Nyisir #${hashtags.join(', #')}…` : `Nyari "${keywords[0]}"…` })
  const discovery = await discoverCandidates({
    hashtags,
    keywords,
    pagesPerHashtag: depth.pagesPerHashtag,
    pagesPerKeyword: depth.pagesPerKeyword,
    maxCandidates: depth.maxCandidates,
  })
  warnings.push(...discovery.warnings)

  // ── Stage 2: resolve, then filter on the cheap dimensions ─────────────────
  const cached = deps.cachedProfiles ?? new Map()
  const handles = [...discovery.candidates.keys()]
  report({ stage: 'resolve', message: `${handles.length} akun ketemu, lagi ambil jumlah follower-nya…`, total: handles.length })
  const { profiles, unresolved } = await resolveHandles(handles, discovery.preResolved, cached)
  if (unresolved.length) {
    warnings.push(`${unresolved.length} akun gak bisa diambil datanya, dilewat.`)
  }

  report({ stage: 'filter', message: `Nyaring ${profiles.size} akun sesuai tier & negara…`, total: profiles.size })
  const wantedTiers = new Set(input.tiers)
  const survivors: { handle: string; profile: KolProfile }[] = []
  let filteredOut = 0

  for (const [handle, profile] of profiles) {
    if (input.country && profile.country && profile.country.toUpperCase() !== input.country.toUpperCase()) {
      filteredOut++
      continue
    }
    const tier = tierOf(profile.followers)
    if (wantedTiers.size && (!tier || !wantedTiers.has(tier))) {
      filteredOut++
      continue
    }
    // Region is checked here too, but only when the caller asked for one.
    // A creator whose bio names no city fails a specific region filter — that is
    // correct and honest, since we genuinely do not know where they are.
    if (input.region && !regionMatches(guessRegionFromBio(profile.bio), input.region)) {
      filteredOut++
      continue
    }
    survivors.push({ handle, profile })
  }

  // Rank before truncating so the enrich budget is spent on the biggest
  // accounts that matched, not on whichever ones the provider happened to
  // return first.
  survivors.sort((a, b) => (b.profile.followers ?? 0) - (a.profile.followers ?? 0))
  let truncated = discovery.truncated
  let toEnrich = survivors
  if (survivors.length > depth.maxEnrich) {
    toEnrich = survivors.slice(0, depth.maxEnrich)
    truncated = `${survivors.length} akun lolos filter, ${depth.maxEnrich} teratas yang diukur performanya. Naikin ke "Dalam" buat lebih banyak.`
  }

  // ── Stage 3: measure performance on an unbiased sample ────────────────────
  report({ stage: 'enrich', message: `${survivors.length} akun lolos filter — ngukur performa asli ${toEnrich.length} akun…`, current: 0, total: toEnrich.length })
  const enriched = await enrichHandles(toEnrich.map((s) => s.handle))

  // ── Stage 4: niche consistency (optional, LLM) ────────────────────────────
  const topic = [...hashtags, ...keywords][0] || input.query
  if (deps.classifyNiche !== false) report({ stage: 'niche', message: `Ngecek konsistensi niche ${toEnrich.length} akun…`, total: toEnrich.length })
  const nicheMap = deps.classifyNiche === false
    ? new Map()
    : await classifyNiches(
        toEnrich
          .map((s) => ({
            handle: s.handle,
            bio: s.profile.bio,
            captions: enriched.get(s.handle)?.captions ?? [],
            topic,
          }))
          .filter((i) => i.captions.length > 0),
      )

  // ── Assemble ──────────────────────────────────────────────────────────────
  const results: KolResult[] = toEnrich.map(({ handle, profile }) => {
    const tier = tierOf(profile.followers)
    const region = guessRegionFromBio(profile.bio)
    const performance = enriched.get(handle)?.performance ?? null
    const niche = nicheMap.get(handle) ?? null
    const flags = buildFlags(profile, tier, performance, region, niche)
    return {
      platform: 'tiktok' as const,
      candidate: discovery.candidates.get(handle) ?? { handle, sources: [], seenVideos: [] },
      profile,
      tier,
      region,
      performance,
      niche,
      flags,
      score: scoreResult(performance, niche, flags),
    }
  })

  const active = input.maxDaysInactive
  const visible = active
    ? results.filter((r) => r.performance?.daysSinceLastPost == null || r.performance.daysSinceLastPost <= active)
    : results
  const hiddenByActivity = results.length - visible.length
  if (hiddenByActivity > 0) {
    warnings.push(`${hiddenByActivity} akun disembunyikan karena udah lama gak posting.`)
  }

  visible.sort(compareResults)
  report({ stage: 'done', message: `${visible.length} KOL siap ditinjau.`, current: visible.length, total: visible.length })

  return {
    results: visible,
    meta: {
      query: input.query,
      hashtagsUsed: hashtags,
      keywordsUsed: keywords,
      candidatesFound: discovery.candidates.size,
      resolved: profiles.size,
      filteredOut,
      enriched: toEnrich.length,
      fromCache: cached.size ? handles.filter((h) => cached.has(h)).length : 0,
      elapsedMs: Date.now() - startedAt,
      truncated,
      warnings,
    },
  }
}
