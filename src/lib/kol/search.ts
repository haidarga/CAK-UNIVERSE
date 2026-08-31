import { discoverCandidates, parseQuery } from '@/lib/kol/discover'
import { discoverInstagram, resolveAndEnrichInstagram, instagramConfigured } from '@/lib/kol/instagram'
import { resolveHandles } from '@/lib/kol/resolve'
import { enrichHandles } from '@/lib/kol/enrich'
import { classifyNiches } from '@/lib/kol/niche'
import { buildFlags, compareResults, scoreResult } from '@/lib/kol/score'
import { detectRegion, detectionMatches } from '@/lib/kol/region-detect'
import { tierOf } from '@/lib/kol/tiers'
import type { KolProfile, KolResult, KolSearchInput, KolSearchResponse } from '@/lib/kol/types'
import type { EnrichedCreator } from '@/lib/kol/enrich'

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

// Instagram is billed per result and cannot filter by tier before the expensive
// call, so its ceilings are lower across the board. Roughly $0.10-0.25 per
// search at these sizes.
const IG_DEPTH = {
  cepat: { postLimit: 30, maxEnrich: 20 },
  standar: { postLimit: 60, maxEnrich: 40 },
  dalam: { postLimit: 120, maxEnrich: 70 },
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

function emptyResponse(query: string, warnings: string[]): KolSearchResponse {
  return {
    results: [],
    resolvedProfiles: [],
    meta: {
      query, hashtagsUsed: [], keywordsUsed: [], candidatesFound: 0, resolved: 0,
      filteredOut: 0, droppedByCountry: 0, droppedByTier: 0, droppedNoFollowers: 0, tierSpread: {},
      enriched: 0, fromCache: 0, elapsedMs: 0, truncated: null, warnings,
    },
  }
}

export async function runKolSearch(input: KolSearchInput, deps: SearchDeps = {}): Promise<KolSearchResponse> {
  const startedAt = Date.now()
  const depth = DEPTH_SETTINGS[input.depth] ?? DEPTH_SETTINGS.standar
  const { hashtags, keywords } = parseQuery(input.query)
  const warnings: string[] = []
  const report = deps.onProgress ?? (() => {})

  if (!hashtags.length && !keywords.length) return emptyResponse(input.query, ['Kata kunci kosong.'])

  const isInstagram = input.platform === 'instagram'
  if (isInstagram && !instagramConfigured()) {
    return emptyResponse(input.query, ['Instagram butuh APIFY_TOKEN yang belum diset.'])
  }
  if (isInstagram && !hashtags.length) {
    // Instagram has no keyword search at any price — only hashtags.
    return emptyResponse(input.query, ['Instagram cuma bisa dicari lewat hashtag. Tulis pakai #, contoh: #skincareindonesia'])
  }

  // ── Stage 1: discover ──────────────────────────────────────────────────────
  report({ stage: 'discover', message: hashtags.length ? `Nyisir #${hashtags.join(', #')}…` : `Nyari "${keywords[0]}"…` })

  const discovery = isInstagram
    ? { ...(await discoverInstagram(hashtags, IG_DEPTH[input.depth].postLimit)), preResolved: new Map(), truncated: null }
    : await discoverCandidates({
        hashtags,
        keywords,
        pagesPerHashtag: depth.pagesPerHashtag,
        pagesPerKeyword: depth.pagesPerKeyword,
        maxCandidates: depth.maxCandidates,
      })
  warnings.push(...discovery.warnings)

  // ── Stage 2: resolve, then filter on the cheap dimensions ─────────────────
  //
  // On TikTok this is a cheap lookup and the tier filter runs straight after,
  // before the expensive stage. Instagram cannot do that: Apify returns the
  // profile and its posts in the SAME call, so by the time follower count is
  // known the measurement has already been paid for. Hence the lower ceilings.
  const cached = deps.cachedProfiles ?? new Map()
  let handles = [...discovery.candidates.keys()]
  let igEnriched: Map<string, EnrichedCreator> | null = null

  if (isInstagram && handles.length > IG_DEPTH[input.depth].maxEnrich) {
    // Rank by how often a creator appeared under the hashtag before spending
    // money on them.
    handles = handles
      .sort((a, b) => (discovery.candidates.get(b)?.seenVideos.length ?? 0) - (discovery.candidates.get(a)?.seenVideos.length ?? 0))
      .slice(0, IG_DEPTH[input.depth].maxEnrich)
  }

  report({ stage: 'resolve', message: `${handles.length} akun ketemu, lagi ambil jumlah follower-nya…`, total: handles.length })

  let profiles: Map<string, KolProfile>
  let unresolved: string[]
  if (isInstagram) {
    const ig = await resolveAndEnrichInstagram(handles)
    profiles = ig.profiles
    unresolved = ig.unresolved
    igEnriched = ig.enriched
  } else {
    const tt = await resolveHandles(handles, discovery.preResolved, cached)
    profiles = tt.profiles
    unresolved = tt.unresolved
  }
  if (unresolved.length) {
    warnings.push(`${unresolved.length} akun gak bisa diambil datanya, dilewat.`)
  }

  report({ stage: 'filter', message: `Nyaring ${profiles.size} akun sesuai tier & negara…`, total: profiles.size })
  const wantedTiers = new Set(input.tiers)
  const survivors: { handle: string; profile: KolProfile }[] = []
  // Counted per reason. "85 gak masuk filter" is useless on its own — the reader
  // cannot tell whether to widen the tier, drop the country filter, or give up
  // on the hashtag, which is the only thing they actually wanted to know.
  const dropped = { country: 0, tier: 0, noFollowers: 0 }
  const nearMiss = new Map<string, number>()

  for (const [handle, profile] of profiles) {
    if (input.country && profile.country && profile.country.toUpperCase() !== input.country.toUpperCase()) {
      dropped.country++
      continue
    }
    const tier = tierOf(profile.followers)
    if (wantedTiers.size && !tier) {
      dropped.noFollowers++
      continue
    }
    if (wantedTiers.size && tier && !wantedTiers.has(tier)) {
      dropped.tier++
      // Which tiers the rejects actually sat in, so the UI can say "ada 47 di
      // tier Makro" instead of leaving the reader to guess and re-run blind.
      nearMiss.set(tier, (nearMiss.get(tier) ?? 0) + 1)
      continue
    }
    // Region is NOT checked here. It used to be, reading the bio alone — which
    // detected a location for 0 of 58 real creators. The signal actually lives in
    // captions and compound hashtags (#kulinerbandung), and those only exist
    // after enrichment, so the region filter moved below stage 3.
    //
    // The cost is real: enriching accounts that a region filter will later drop.
    // Worth it, because bio-only region was not a cheaper filter, it was a
    // broken one.
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
  // Instagram's posts arrived with the profile, so re-fetching would be a second
  // billed call for data already in hand.
  const enriched = igEnriched ?? (await enrichHandles(toEnrich.map((s) => s.handle)))

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
    const enrichedRow = enriched.get(handle)
    // Every text signal at once: the handle, the bio, up to 20 captions, and any
    // real place tags. Weighted voting, so a food creator who filmed once in Bali
    // is not relocated there.
    const region = detectRegion({
      handle,
      bio: profile.bio,
      captions: enrichedRow?.captions ?? [],
      geoTags: enrichedRow?.geoTags ?? [],
    })
    const performance = enrichedRow?.performance ?? null
    const niche = nicheMap.get(handle) ?? null
    const flags = buildFlags(profile, tier, performance, region, niche)
    return {
      platform: input.platform,
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
  const afterActivity = active
    ? results.filter((r) => r.performance?.daysSinceLastPost == null || r.performance.daysSinceLastPost <= active)
    : results
  const hiddenByActivity = results.length - afterActivity.length
  if (hiddenByActivity > 0) {
    warnings.push(`${hiddenByActivity} akun disembunyikan karena udah lama gak posting.`)
  }

  // Region filter, now that captions exist. Creators whose location could not be
  // worked out are dropped by a specific filter — that is the honest behaviour,
  // and the warning says how many so nobody reads a short list as a small niche.
  const visible = input.region ? afterActivity.filter((r) => detectionMatches(r.region, input.region!)) : afterActivity
  const hiddenByRegion = afterActivity.length - visible.length
  if (hiddenByRegion > 0) {
    const unknown = afterActivity.filter((r) => !r.region.area).length
    warnings.push(
      `${hiddenByRegion} akun gak lolos filter region` +
        (unknown ? ` (${unknown} di antaranya lokasinya emang gak ketahuan).` : '.'),
    )
  }

  visible.sort(compareResults)
  report({ stage: 'done', message: `${visible.length} KOL siap ditinjau.`, current: visible.length, total: visible.length })

  return {
    // EVERY profile the sweep resolved, not just the ones that survived the
    // filters. The route caches this, and caching only the visible rows meant a
    // sweep could pay for 90 lookups and keep 4 — so the next search redid 86
    // lookups it had already bought.
    resolvedProfiles: [...profiles.values()],
    results: visible,
    meta: {
      query: input.query,
      hashtagsUsed: hashtags,
      keywordsUsed: keywords,
      candidatesFound: discovery.candidates.size,
      resolved: profiles.size,
      filteredOut: dropped.country + dropped.tier + dropped.noFollowers,
      droppedByCountry: dropped.country,
      droppedByTier: dropped.tier,
      droppedNoFollowers: dropped.noFollowers,
      tierSpread: Object.fromEntries([...nearMiss.entries()].sort((a, b) => b[1] - a[1])),
      enriched: toEnrich.length,
      fromCache: cached.size ? handles.filter((h) => cached.has(h)).length : 0,
      elapsedMs: Date.now() - startedAt,
      truncated,
      warnings,
    },
  }
}
