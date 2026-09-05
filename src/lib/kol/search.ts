import { discoverCandidates, parseQuery, MAX_HASHTAGS, MAX_KEYWORDS } from '@/lib/kol/discover'
import { discoverInstagram, resolveAndEnrichInstagram, instagramConfigured } from '@/lib/kol/instagram'
import { resolveHandles } from '@/lib/kol/resolve'
import { enrichHandles } from '@/lib/kol/enrich'
import { classifyNiches } from '@/lib/kol/niche'
import { buildFlags, compareResults, scoreResult, looksLikeBusiness, isTooSmallToUse, missedReason } from '@/lib/kol/score'
import { detectRegion, detectionMatches } from '@/lib/kol/region-detect'
import { regionHashtags, regionLabel, countryHashtags } from '@/lib/kol/regions'
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

// Raised across the board. The old ceilings were set when a sweep took two and a
// half minutes; after the resolve rewrite the same work runs in about fifteen
// seconds, and a "Cepat" search that surfaces 58 candidates and shows one row is
// not fast, it is empty.
const DEPTH_SETTINGS = {
  cepat: { pagesPerHashtag: 4, pagesPerKeyword: 2, maxCandidates: 90, maxEnrich: 40 },
  standar: { pagesPerHashtag: 6, pagesPerKeyword: 3, maxCandidates: 150, maxEnrich: 70 },
  dalam: { pagesPerHashtag: 15, pagesPerKeyword: 5, maxCandidates: 320, maxEnrich: 140 },
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
  /**
   * Looks the cache up by the handles this sweep actually found.
   *
   * Preferred over `cachedProfiles`, which required loading the whole table up
   * front — and PostgREST caps that at 1000 rows, so past a thousand creators
   * the preload returned an arbitrary slice that changed between identical
   * searches.
   */
  lookupCache?: (handles: string[]) => Promise<Map<string, KolProfile>>
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
      filteredOut: 0, droppedByCountry: 0, droppedForeignEarly: 0, droppedByTier: 0, droppedNoFollowers: 0, tierSpread: {}, droppedByRegion: 0, droppedByActivity: 0,
      enriched: 0, fromCache: 0, elapsedMs: 0, truncated: null, warnings,
    },
  }
}

export async function runKolSearch(input: KolSearchInput, deps: SearchDeps = {}): Promise<KolSearchResponse> {
  const startedAt = Date.now()
  const depth = DEPTH_SETTINGS[input.depth] ?? DEPTH_SETTINGS.standar
  const { hashtags, keywords, dropped: droppedTerms } = parseQuery(input.query)
  const warnings: string[] = []
  const report = deps.onProgress ?? (() => {})

  if (!hashtags.length && !keywords.length) return emptyResponse(input.query, ['Kata kunci kosong.'])
  if (droppedTerms > 0) {
    warnings.push(
      `${droppedTerms} kata kunci gak diproses — maksimal ${MAX_HASHTAGS} hashtag dan ${MAX_KEYWORDS} kata kunci sekali cari, biar gak kelamaan dan gak boros kuota.`,
    )
  }

  const isInstagram = input.platform === 'instagram'
  if (isInstagram && !instagramConfigured()) {
    return emptyResponse(input.query, ['Instagram butuh APIFY_TOKEN yang belum diset.'])
  }
  if (isInstagram && !hashtags.length && !regionHashtags(input.region, keywords).length) {
    // Instagram has no keyword search at any price — only hashtags.
    return emptyResponse(input.query, ['Instagram cuma bisa dicari lewat hashtag. Tulis pakai #, contoh: #skincareindonesia'])
  }

  // Region STEERS the sweep, it does not merely trim its output.
  //
  // Sweeping "#kuliner" worldwide and then guessing where 194 strangers live is
  // inference. Sweeping "#kulinerbandung" is not: everyone who turns up put
  // themselves there. It also rescues the niches where text inference fails —
  // a beauty creator never writes her city in her bio, but she does write
  // #skincarebandung when she is selling to her own city.
  // The total stays inside MAX_HASHTAGS. Region tags are added WITHIN that
  // budget, not on top of it — stacking them on the cap turned a "Dalam" sweep
  // into nine hashtags at fifteen pages each, which is precisely the cost
  // blowout the cap exists to prevent.
  const REGION_TAG_SLOTS = 2
  const localTags = regionHashtags(input.region, [...hashtags, ...keywords], REGION_TAG_SLOTS)
  // The country filter steers too. Without it, "#gaming" swept 66 creators, every
  // one of them foreign, and the Indonesia filter left nothing — a search that
  // looked broken when it had simply been pointed at a global tag.
  const idTags = localTags.length ? [] : countryHashtags(input.country, [...hashtags, ...keywords], 2)
  const steerTags = [...localTags, ...idTags]
  const ownTags = steerTags.length ? hashtags.slice(0, MAX_HASHTAGS - steerTags.length) : hashtags
  const sweepHashtags = [...new Set([...ownTags, ...steerTags])]
  if (localTags.length) {
    warnings.push(
      `Ditambahin hashtag lokal biar hasilnya nyambung sama ${regionLabel(input.region)}: #${localTags.join(', #')}`,
    )
  }
  if (idTags.length) {
    warnings.push(`Ditambahin versi Indonesia-nya biar gak ketimbun kreator luar: #${idTags.join(', #')}`)
  }
  if (hashtags.length > ownTags.length) {
    warnings.push(
      `${hashtags.length - ownTags.length} hashtag kamu digeser buat kasih tempat ke hashtag lokal. Hapus filter region kalau mau semuanya kepakai.`,
    )
  }

  // ── Stage 1: discover ──────────────────────────────────────────────────────
  report({ stage: 'discover', message: sweepHashtags.length ? `Nyisir #${sweepHashtags.join(', #')}…` : `Nyari "${keywords[0]}"…` })

  const discovery = isInstagram
    ? { ...(await discoverInstagram(sweepHashtags, IG_DEPTH[input.depth].postLimit)), preResolved: new Map(), truncated: null, totalFound: 0, droppedForeign: 0 }
    : await discoverCandidates({
        hashtags: sweepHashtags,
        keywords,
        pagesPerHashtag: depth.pagesPerHashtag,
        pagesPerKeyword: depth.pagesPerKeyword,
        maxCandidates: depth.maxCandidates,
        // Spend the candidate budget on accounts that can actually appear in the
        // result. Without this, a globally-used hashtag fills all 90 slots with
        // creators the country filter is guaranteed to reject moments later.
        preferCountry: input.country,
      })
  warnings.push(...discovery.warnings)

  // ── Stage 2: resolve, then filter on the cheap dimensions ─────────────────
  //
  // On TikTok this is a cheap lookup and the tier filter runs straight after,
  // before the expensive stage. Instagram cannot do that: Apify returns the
  // profile and its posts in the SAME call, so by the time follower count is
  // known the measurement has already been paid for. Hence the lower ceilings.
  let handles = [...discovery.candidates.keys()]
  const cached = deps.lookupCache ? await deps.lookupCache(handles) : (deps.cachedProfiles ?? new Map())
  let igEnriched: Map<string, EnrichedCreator> | null = null

  let igTruncated: string | null = null
  if (isInstagram && handles.length > IG_DEPTH[input.depth].maxEnrich) {
    // Rank by how often a creator appeared under the hashtag before spending
    // money on them.
    const cap = IG_DEPTH[input.depth].maxEnrich
    igTruncated = `Ketemu ${handles.length} akun, diproses ${cap} teratas (yang paling sering muncul). Instagram berbayar per akun, jadi dibatasi.`
    handles = handles
      .sort((a, b) => (discovery.candidates.get(b)?.seenVideos.length ?? 0) - (discovery.candidates.get(a)?.seenVideos.length ?? 0))
      .slice(0, cap)
  }

  // Instagram exposes no country field at all, so the country filter below can
  // never fire on this path. Reporting "0 dibuang karena negara" would read as
  // "we checked and everyone was Indonesian" — a measurement we did not take.
  if (isInstagram && input.country) {
    warnings.push(
      'Instagram gak ngasih kode negara, jadi filter negara gak jalan di sini. Hasilnya bisa kemasukan kreator luar — pakai filter region kalau butuh batas wilayah.',
    )
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
    // Named plainly, because the usual cause is Zapi still scraping them for the
    // first time — and they will be instant on the next search rather than gone.
    warnings.push(
      `${unresolved.length} akun belum sempat kebaca (biasanya akun yang baru pertama kali dicek). Cari lagi bentar, biasanya udah kebaca.`,
    )
  }

  report({ stage: 'filter', message: `Nyaring ${profiles.size} akun sesuai tier & negara…`, total: profiles.size })
  const wantedTiers = new Set(input.tiers)
  // Only COUNTRY still excludes. It is free, it runs before any measurement, and
  // it keeps a hashtag's foreign half out of the pool entirely.
  //
  // Tier used to exclude here too. Stacked with region and activity downstream,
  // that produced a chain of AND gates that landed on zero or one result as a
  // matter of routine — every gate working correctly, and the reader staring at
  // a blank screen with no way to tell how close they came. Tier now RANKS: an
  // off-tier creator is measured, shown, and labelled, and the reader decides.
  const survivors: { handle: string; profile: KolProfile; tierMatch: boolean }[] = []
  const dropped = { country: 0, tier: 0, noFollowers: 0, tooSmall: 0 }
  const nearMiss = new Map<string, number>()

  for (const [handle, profile] of profiles) {
    if (input.country && profile.country && profile.country.toUpperCase() !== input.country.toUpperCase()) {
      dropped.country++
      continue
    }
    if (isTooSmallToUse(profile)) {
      dropped.tooSmall++
      continue
    }
    const tier = tierOf(profile.followers)
    const tierMatch = !wantedTiers.size || (!!tier && wantedTiers.has(tier))
    if (!tierMatch) {
      dropped.tier++
      if (tier) nearMiss.set(tier, (nearMiss.get(tier) ?? 0) + 1)
    }
    if (wantedTiers.size && !tier) dropped.noFollowers++
    survivors.push({ handle, profile, tierMatch })
  }

  // Creators who match the requested tier get the measurement budget first;
  // everyone else fills whatever is left, so a search always has something to
  // show even when the tier turns out to be the wrong guess for this niche.
  survivors.sort(
    (a, b) =>
      Number(b.tierMatch) - Number(a.tierMatch) || (b.profile.followers ?? 0) - (a.profile.followers ?? 0),
  )
  let truncated = discovery.truncated ?? igTruncated
  let toEnrich = survivors
  if (survivors.length > depth.maxEnrich) {
    toEnrich = survivors.slice(0, depth.maxEnrich)
    truncated = `${survivors.length} akun ketemu, ${depth.maxEnrich} teratas yang diukur performanya. Naikin ke "Dalam" buat lebih banyak.`
  }

  // ── Stage 3: measure performance on an unbiased sample ────────────────────
  report({ stage: 'enrich', message: `${survivors.length} akun lolos filter — ngukur performa asli ${toEnrich.length} akun…`, current: 0, total: toEnrich.length })
  // Instagram's posts arrived with the profile, so re-fetching would be a second
  // billed call for data already in hand.
  const enriched = igEnriched ?? (await enrichHandles(toEnrich.map((s) => s.handle)))

  // ── Stage 4: niche consistency (optional, LLM) ────────────────────────────
  const topic = [...hashtags, ...keywords][0] || input.query
  if (deps.classifyNiche !== false) report({ stage: 'niche', message: `Ngecek konsistensi niche ${toEnrich.length} akun…`, total: toEnrich.length })
  const nicheInputs =
    deps.classifyNiche === false
      ? []
      : toEnrich
          .map((s) => ({
            handle: s.handle,
            bio: s.profile.bio,
            captions: enriched.get(s.handle)?.captions ?? [],
            topic,
          }))
          .filter((i) => i.captions.length > 0)
  const nicheMap = nicheInputs.length ? await classifyNiches(nicheInputs) : new Map()

  // A classifier that fails for EVERY creator is broken, not merely unlucky, and
  // it must not read as "none of them matched". Found live: a stale machine-level
  // GEMINI_API_KEY shadowed the project's own, Google had blocked it as leaked,
  // and every row rendered "niche —" while the sweep reported success.
  if (nicheInputs.length >= 3 && nicheMap.size === 0) {
    warnings.push(
      'Penilaian niche gak jalan — semua panggilan AI gagal. Cek GEMINI_API_KEY (kalau ada variabel environment di komputer/Vercel dengan nama sama, itu yang dipakai, bukan .env.local). Kolom niche dikosongin, sisanya tetap terukur.',
    )
  }

  // ── Assemble ──────────────────────────────────────────────────────────────
  const results: KolResult[] = toEnrich.map(({ handle, profile, tierMatch }) => {
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
    const flags = buildFlags(profile, tier, performance, region, niche, {
      tierMatch,
      business: looksLikeBusiness(profile),
      // Suppressed on Instagram: Apify returns no country for ANY IG account, so
      // the flag fired on every row and quietly docked every score by the same
      // ten points — a platform limitation, not a signal about the creator.
      wantedCountry: isInstagram ? null : input.country,
      // The near-miss badge on the row already says the location is unknown; a
      // chip repeating it is noise, and the two used to contradict each other.
      suppressRegionFlag: !!input.region,
    })
    return {
      platform: input.platform,
      candidate: discovery.candidates.get(handle) ?? { handle, sources: [], seenVideos: [] },
      profile,
      tier,
      region,
      performance,
      niche,
      flags,
      tierMatch,
      score: scoreResult(performance, niche, flags),
    }
  })

  // The two filters that run AFTER measurement. Rejects here are fully measured,
  // which is what makes them safe to offer back as near misses below.
  const active = input.maxDaysInactive
  const passesActivity = (r: KolResult) =>
    !active || r.performance?.daysSinceLastPost == null || r.performance.daysSinceLastPost <= active
  const passesRegion = (r: KolResult) => !input.region || detectionMatches(r.region, input.region)

  // Region no longer removes anyone. Location is an ESTIMATE — measured at
  // 90%+ on food and travel but near zero on beauty and fashion — and letting an
  // estimate delete rows produced "0 KOL cocok" on searches that had found
  // perfectly good creators. It now ranks and labels, exactly like tier.
  // A creator only counts as a match when they pass every deliberate filter AND
  // actually make the content being searched for. Relevance used to live only in
  // the score, so an off-topic account could still occupy the matched section by
  // being the right size.
  const missOf = (r: KolResult) =>
    missedReason(r.niche, passesActivity(r), passesRegion(r), !!r.region.area)

  const visible = results.filter((r) => missOf(r) === null)
  const droppedByActivity = results.filter((r) => missOf(r) === 'activity').length
  const droppedByRegion = results.filter((r) => missOf(r) === 'region' || missOf(r) === 'region-unknown').length
  const droppedOffTopic = results.filter((r) => missOf(r) === 'off-topic').length

  if (droppedOffTopic > 0) {
    warnings.push(
      `${droppedOffTopic} akun ada di hashtag ini tapi gak ada satu pun post-nya yang beneran soal topik itu — ditaruh di bawah, ditandai.`,
    )
  }

  if (dropped.tooSmall > 0) {
    warnings.push(`${dropped.tooSmall} akun di bawah 1.000 follower dibuang — kekecilan buat dipakai kampanye.`)
  }
  if (droppedByActivity > 0) warnings.push(`${droppedByActivity} akun disembunyikan karena udah lama gak posting.`)
  if (droppedByRegion > 0) {
    const unknown = results.filter((r) => passesActivity(r) && !passesRegion(r) && !r.region.area).length
    warnings.push(
      `${droppedByRegion} akun lokasinya beda atau gak ketahuan` +
        (unknown ? ` (${unknown} di antaranya emang gak kebaca)` : '') +
        ' — tetap ditampilin di bagian bawah, ditandai. Lokasi cuma perkiraan, jadi gak ada yang dibuang.',
    )
  }

  // Some niches simply have no geography. Perfume, fashion and beauty creators
  // rarely name a city anywhere, so a region filter there does not narrow the
  // list — it deletes it, and every remaining row reads "lokasi gak ketahuan".
  // Saying so is more useful than handing back a page of near misses and letting
  // the reader conclude the tool is broken.
  if (results.length >= 5) {
    const located = results.filter((r) => r.region.area).length
    const share = located / results.length
    if (share < 0.4) {
      warnings.push(
        `Cuma ${located} dari ${results.length} kreator di niche ini yang nyebut lokasinya${
          input.region ? ' — filter region kurang cocok di sini, mending dimatiin' : ''
        }. Deteksi lokasi paling nendang di kuliner dan wisata, lemah di parfum, fashion, dan beauty.`,
      )
    }
  }

  // EVERY creator we measured is returned, marked with the filter it missed.
  //
  // This used to append at most twelve near misses, and only when the matched
  // list was nearly empty. The result contradicted the tool's own text: the page
  // said "43 akun di luar tier tetap ditampilin di bawah" and then rendered
  // twelve rows, while 37 creators we had already paid to measure were dropped
  // on the floor.
  //
  // There is no reason to throw away a measurement. Matched rows come first,
  // near misses sit below their own heading, and every row says which filter it
  // failed — the reader scrolls or stops, which is their call, not the filter's.
  const nearMisses: KolResult[] = results
    .filter((r) => !visible.includes(r))
    .map((r) => ({ ...r, missed: missOf(r) }))
    .sort(compareResults)

  if (discovery.droppedForeign > 0) {
    const share = Math.round((discovery.droppedForeign / Math.max(discovery.totalFound, 1)) * 100)
    warnings.push(
      share >= 60
        ? `${discovery.droppedForeign} dari ${discovery.totalFound} akun (${share}%) itu kreator luar negeri — hashtag ini dipakai global. Coba hashtag versi Indonesia, misal tambahin "indonesia" atau nama kota.`
        : `${discovery.droppedForeign} akun luar negeri dibuang sebelum diproses, jadi jatahnya kepakai buat akun Indonesia.`,
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
    results: [...visible, ...nearMisses],
    meta: {
      query: input.query,
      hashtagsUsed: hashtags,
      keywordsUsed: keywords,
      candidatesFound: discovery.totalFound || discovery.candidates.size,
      droppedForeignEarly: discovery.droppedForeign,
      resolved: profiles.size,
      filteredOut: dropped.country + dropped.tier + dropped.noFollowers + dropped.tooSmall,
      droppedByCountry: dropped.country,
      droppedByTier: dropped.tier,
      droppedNoFollowers: dropped.noFollowers,
      tierSpread: Object.fromEntries([...nearMiss.entries()].sort((a, b) => b[1] - a[1])),
      droppedByRegion,
      droppedByActivity,
      enriched: toEnrich.length,
      // Only the TikTok path consults the cache. Instagram always makes a fresh
      // billed call, so counting set membership there reported cache hits that
      // never happened.
      fromCache: isInstagram ? 0 : handles.filter((h) => cached.has(h)).length,
      elapsedMs: Date.now() - startedAt,
      truncated,
      warnings,
    },
  }
}
