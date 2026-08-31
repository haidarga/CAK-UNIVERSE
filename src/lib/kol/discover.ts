import {
  searchTikTokUsers,
  searchTikTokVideos,
  fetchTikTokHashtagPosts,
  normalizeHandle,
  type ZapiTikTokVideo,
  type ZapiTikTokSearchUser,
} from '@/lib/integrations/scrapers/zapi'
import type { KolCandidate, KolSource } from '@/lib/kol/types'

// Stage 1 — discovery. Turn a phrase into a set of handles worth looking at.
//
// Three paths run because each one is blind to what the others find:
//
//   hashtag-posts   creators who ACTUALLY POST the content. The best source, and
//                   the one that is slowest to do by hand.
//   search (video)  creators talking about the topic without using the hashtag.
//   search-users    accounts NAMED after the topic. Shallow and mostly
//                   brand/spam accounts, but it is where the official accounts
//                   live, and it costs one call.
//
// Running only search-users — the obvious single-call design — would have
// returned 19 nano junk accounts out of 20 for "gaming indonesia", including
// three with under 60 followers, and would have missed every real creator.

export interface DiscoverOptions {
  hashtags: string[]
  keywords: string[]
  pagesPerHashtag: number
  pagesPerKeyword: number
  /** Hard ceiling on candidates. Reaching it is reported, never silent. */
  maxCandidates: number
  /**
   * ISO country the caller wants, e.g. "ID".
   *
   * Every video row carries the country it was posted from, and that field is
   * FREE — it arrives with discovery, long before the per-handle lookups. Using
   * it here is the difference between spending the whole candidate budget on
   * accounts that a later filter will certainly reject, and spending it on
   * accounts that can actually appear in the result.
   *
   * Observed live: a home-decor hashtag returned 90 candidates, every one of
   * them American or British, all resolved at full cost and then all discarded.
   */
  preferCountry?: string | null
}

export interface DiscoverOutcome {
  candidates: Map<string, KolCandidate>
  /** search-users rows arrive pre-populated, so the resolve stage can skip them. */
  preResolved: Map<string, ZapiTikTokSearchUser>
  warnings: string[]
  truncated: string | null
  /** Unique handles seen BEFORE any cap or country pass. */
  totalFound: number
  /** Dropped here because every video of theirs came from another country. */
  droppedForeign: number
  /** Discovery paths that errored out. Distinguishes "provider down" from "no such tag". */
  sourceFailures: number
  /** How many discovery paths were attempted in total. */
  sourcesAttempted: number
}

// Hard caps on how far one request may fan out.
//
// Each hashtag opens its own paged sweep and each keyword opens two more, all in
// parallel. The query string was bounded to 200 characters but the NUMBER of
// terms inside it was not, so a comma-separated list fit 60-90 hashtags — up to
// ~900 outbound TikTok requests, or 60-90 simultaneous Apify runs at up to 120
// billed results each. That is tens of dollars from a single POST, and there is
// no rate limiting in front of it.
//
// Five hashtags is well beyond what a real search needs; anything past that is
// reported, never silently dropped.
export const MAX_HASHTAGS = 5
export const MAX_KEYWORDS = 3

/** Splits free text into hashtags and plain keywords. "#skincare, glowing" → both. */
export function parseQuery(query: string): { hashtags: string[]; keywords: string[]; dropped: number } {
  const parts = (query || '')
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const hashtags: string[] = []
  const keywords: string[] = []
  for (const part of parts) {
    if (part.startsWith('#')) {
      const tag = part.replace(/^#/, '').replace(/\s+/g, '')
      if (tag) hashtags.push(tag.toLowerCase())
      continue
    }
    keywords.push(part)
    // A multi-word phrase is also a plausible hashtag once spaces are removed,
    // and that collapsed form is how Indonesian creators actually tag things
    // ("skincare indonesia" → #skincareindonesia). Cheap extra coverage.
    const collapsed = part.replace(/\s+/g, '').toLowerCase()
    if (collapsed.length >= 4) hashtags.push(collapsed)
  }
  const uniqueHashtags = [...new Set(hashtags)]
  const uniqueKeywords = [...new Set(keywords)]
  const dropped =
    Math.max(0, uniqueHashtags.length - MAX_HASHTAGS) + Math.max(0, uniqueKeywords.length - MAX_KEYWORDS)

  return {
    hashtags: uniqueHashtags.slice(0, MAX_HASHTAGS),
    keywords: uniqueKeywords.slice(0, MAX_KEYWORDS),
    dropped,
  }
}

function addVideo(map: Map<string, KolCandidate>, video: ZapiTikTokVideo, source: KolSource): void {
  const handle = normalizeHandle(video.author?.username || '')
  if (!handle) return
  // Ads are paid placements, not organic creator content, and their metrics say
  // nothing about how an audience responds to the creator.
  if (video.isAd) return

  const existing = map.get(handle)
  const entry = existing ?? { handle, sources: [], seenVideos: [] }
  if (!entry.sources.includes(source)) entry.sources.push(source)
  entry.seenVideos.push({
    videoId: video.videoId ?? null,
    url: video.url ?? null,
    caption: video.title ?? null,
    playCount: video.playCount ?? null,
    diggCount: video.diggCount ?? null,
    commentCount: video.commentCount ?? null,
    createTimeIso: video.createTimeIso ?? null,
    region: video.region ?? null,
  })
  if (!existing) map.set(handle, entry)
}

/**
 * Walks a paged endpoint, stopping on hasMore=false, a page cap, or a hard error.
 *
 * Page 1 gets a retry. Zapi returns transient "Temporarily unavailable" under
 * load — observed live killing a whole search — and losing page 1 means losing
 * the entire hashtag, which then reads to the user as "hashtag ini kosong".
 * Later pages are not retried: by then we already have candidates, and a partial
 * sweep beats a slow one.
 */
async function walkPages<T>(
  maxPages: number,
  fetchPage: (page: number) => Promise<{ hasMore?: boolean; nextPage?: number | null } & T>,
  onPage: (payload: T) => void,
  onError: (e: unknown, page: number) => void,
): Promise<void> {
  let next: number | null = 1
  for (let i = 0; i < maxPages && next !== null; i++) {
    const page: number = next
    let lastError: unknown = null
    const attempts = page === 1 ? 2 : 1

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const res = await fetchPage(page)
        onPage(res)
        next = res.hasMore && res.nextPage ? res.nextPage : null
        lastError = null
        break
      } catch (e) {
        lastError = e
        if (attempt + 1 < attempts) await new Promise((r) => setTimeout(r, 1_500))
      }
    }

    if (lastError) {
      onError(lastError, page)
      return
    }
  }
}

export async function discoverCandidates(opts: DiscoverOptions): Promise<DiscoverOutcome> {
  const candidates = new Map<string, KolCandidate>()
  const preResolved = new Map<string, ZapiTikTokSearchUser>()
  const warnings: string[] = []
  let truncated: string | null = null
  // Counted separately from warnings: an empty result caused by the provider
  // being down must never be reported to the user as a misspelled hashtag.
  let sourceFailures = 0

  const hashtagWork = opts.hashtags.map((tag) =>
    walkPages(
      opts.pagesPerHashtag,
      (page) => fetchTikTokHashtagPosts(tag, page),
      (res) => (res.videos || []).forEach((v) => addVideo(candidates, v, 'hashtag')),
      // One dead hashtag must not sink a multi-hashtag search — record it and
      // let the other paths carry the result.
      (e) => {
        sourceFailures++
        warnings.push(`Hashtag #${tag} gagal dibaca: ${e instanceof Error ? e.message : 'error'}`)
      },
    ),
  )

  const keywordVideoWork = opts.keywords.map((kw) =>
    walkPages(
      opts.pagesPerKeyword,
      (page) => searchTikTokVideos(kw, page),
      (res) => (res.videos || []).forEach((v) => addVideo(candidates, v, 'keyword-video')),
      (e) => {
        sourceFailures++
        warnings.push(`Pencarian video "${kw}" gagal: ${e instanceof Error ? e.message : 'error'}`)
      },
    ),
  )

  const keywordUserWork = opts.keywords.map((kw) =>
    walkPages(
      opts.pagesPerKeyword,
      (page) => searchTikTokUsers(kw, page),
      (res) => {
        for (const user of res.users || []) {
          const handle = normalizeHandle(user.username || '')
          if (!handle) continue
          preResolved.set(handle, user)
          const existing = candidates.get(handle)
          if (existing) {
            if (!existing.sources.includes('keyword-user')) existing.sources.push('keyword-user')
          } else {
            candidates.set(handle, { handle, sources: ['keyword-user'], seenVideos: [] })
          }
        }
      },
      (e) => {
        sourceFailures++
        warnings.push(`Pencarian akun "${kw}" gagal: ${e instanceof Error ? e.message : 'error'}`)
      },
    ),
  )

  await Promise.all([...hashtagWork, ...keywordVideoWork, ...keywordUserWork])
  const totalFound = candidates.size

  // Country pass, using the free per-video field. A creator whose every seen
  // video came from somewhere else is almost certainly based there, and paying
  // for a lookup to confirm it wastes a slot the caller needed.
  //
  // Deliberately conservative: a candidate with NO country on any video is kept,
  // because absence of the field is not evidence of a foreign account. Only a
  // unanimous foreign signal drops anyone.
  let droppedForeign = 0
  const want = opts.preferCountry?.toUpperCase() || null
  if (want) {
    for (const [handle, candidate] of [...candidates]) {
      const seen = candidate.seenVideos.map((v) => v.region).filter(Boolean) as string[]
      if (seen.length && !seen.some((r) => r.toUpperCase() === want)) {
        candidates.delete(handle)
        droppedForeign++
      }
    }
  }

  if (candidates.size > opts.maxCandidates) {
    // Keep the ones seen most often first: appearing across several videos or
    // several paths is the strongest free signal that a creator is genuinely
    // active in this niche.
    const ranked = [...candidates.values()].sort(
      (a, b) => b.sources.length - a.sources.length || b.seenVideos.length - a.seenVideos.length,
    )
    const kept = ranked.slice(0, opts.maxCandidates)
    truncated = `Ketemu ${candidates.size} akun yang cocok, diproses ${opts.maxCandidates} teratas (yang paling sering muncul).`
    candidates.clear()
    for (const c of kept) candidates.set(c.handle, c)
  }

  return {
    candidates, preResolved, warnings, truncated, totalFound, droppedForeign,
    sourceFailures,
    sourcesAttempted: opts.hashtags.length + opts.keywords.length * 2,
  }
}
