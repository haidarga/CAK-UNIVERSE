import { REGIONS } from '@/lib/kol/regions'

// Where is this creator actually based?
//
// ─────────────────────────────────────────────────────────────────────────────
// A CORRECTION, AND WHY THIS FILE EXISTS
//
// The first version read the bio only and scored 0 of 58 creators, which led to
// "province is basically undetectable". That conclusion was wrong — it was an
// artifact of testing one weak field on a niche (skincare) where location is
// irrelevant. Measured across bio + captions + hashtag tokens:
//
//   #kulinerbandung   bio 58%  →  combined 100%
//   #kuliner          bio 42%  →  combined  92%
//   #wisataindonesia  bio 50%  →  combined  92%
//   #ootdindo         bio  0%  →  combined  25%
//
// Two things the bio-only version could never see:
//   · The city lives INSIDE compound hashtags — #kulinerbandung, #seblakbandung,
//     #explorebanyuwangi. A word-boundary regex cannot match "bandung" there.
//   · The handle itself often says it: @cobakulineransurabaya, @dricha_jakarta.
//
// FIRST MATCH WINS IS NOT ENOUGH EITHER
//
// Food and travel creators name many cities. Taking the first hit put
// @kulinerkabandung in Bali because one post carried #bali, and sent a Lombok
// tour operator to Jakarta. So every mention is a VOTE, weighted by how much the
// signal is worth, and the winner has to actually dominate. A creator who covers
// the whole country produces no dominant city and is reported as exactly that
// rather than being assigned a random province.
// ─────────────────────────────────────────────────────────────────────────────

export type RegionConfidence = 'tinggi' | 'sedang' | 'rendah'

export interface RegionDetection {
  area: string | null
  confidence: RegionConfidence | null
  /** Human-readable proof, e.g. "#kulinerbandung, bio, 4 caption". */
  evidence: string | null
  /** Share of all location votes that went to the winner, 0–1. */
  dominance: number
  /** Other areas that polled meaningfully. Present when a creator roams. */
  alternates: string[]
}

export interface RegionSignals {
  handle?: string | null
  bio?: string | null
  captions?: string[]
  /** Real geo tags from post metadata. Instagram supplies these; TikTok does not. */
  geoTags?: string[]
}

// Aliases that are ordinary Indonesian words long before they are places:
//   medan (arena), padang (plain), solo (alone), malang (unlucky),
//   kudus (holy), serang (to attack), metro, tegal (dry field).
// Counting these from loose prose invented a Sumatran creator out of the phrase
// "medan perang". They only count when something marks them as a place.
const AMBIGUOUS = new Set(['medan', 'padang', 'solo', 'malang', 'kudus', 'serang', 'metro', 'tegal', 'bali'])

// What each kind of evidence is worth. A GPS tag beats a passing mention by a
// wide margin, and one hashtag the creator chose for themselves beats several
// incidental words.
const WEIGHT = { geo: 8, handle: 6, hashtag: 3, bio: 3, caption: 1 } as const

interface Alias {
  area: string
  alias: string
}

// Longest first so "balikpapan" is claimed before "bali" can steal it, and
// "bandarlampung" before "lampung".
const ALIASES: Alias[] = REGIONS.flatMap((r) => r.aliases.map((alias) => ({ area: r.id, alias })))
  .sort((a, b) => b.alias.length - a.alias.length)

const COMPACT_ALIASES = ALIASES.filter((a) => a.alias.length >= 4 && !a.alias.includes(' '))

function wordHit(text: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text)
}

/** An ambiguous word counts only next to a marker that makes it a place. */
function markedHit(text: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:di|kota|kab|kabupaten|dari|📍|🏙|@)\\s*${escaped}([^a-z0-9]|$)`, 'i').test(text)
}

type Vote = { area: string; weight: number; label: string }

function voteFromTokens(text: string, weight: number, kind: 'hashtag' | 'handle'): Vote[] {
  // Inside a hashtag or a handle, substring matching is safe: nobody writes
  // "#kulinerbandung" without meaning Bandung. The length floor and
  // longest-first ordering keep short aliases from grabbing compound words.
  const tokens =
    kind === 'hashtag'
      ? (text.toLowerCase().match(/#[a-z0-9_]+/g) || []).map((t) => t.slice(1))
      : [text.toLowerCase().replace(/[^a-z0-9]/g, '')]
  const votes: Vote[] = []
  for (const token of tokens) {
    for (const { area, alias } of COMPACT_ALIASES) {
      if (token.includes(alias)) {
        votes.push({ area, weight, label: kind === 'hashtag' ? `#${token}` : `handle @${text}` })
        break // one vote per token; the longest alias already won
      }
    }
  }
  return votes
}

function voteFromProse(text: string, weight: number, label: string): Vote[] {
  const lower = text.toLowerCase()
  const votes: Vote[] = []
  const claimed = new Set<string>()
  for (const { area, alias } of ALIASES) {
    if (claimed.has(area)) continue
    const hit = AMBIGUOUS.has(alias) ? markedHit(lower, alias) : wordHit(lower, alias)
    if (hit) {
      votes.push({ area, weight, label })
      claimed.add(area)
    }
  }
  return votes
}

/** Weighted vote across every signal we hold. */
export function detectRegion(signals: RegionSignals): RegionDetection {
  const votes: Vote[] = []

  for (const tag of signals.geoTags || []) {
    votes.push(...voteFromProse(tag, WEIGHT.geo, `lokasi post "${tag}"`))
  }
  if (signals.handle) votes.push(...voteFromTokens(signals.handle, WEIGHT.handle, 'handle'))
  if (signals.bio) {
    votes.push(...voteFromTokens(signals.bio, WEIGHT.hashtag, 'hashtag'))
    votes.push(...voteFromProse(signals.bio, WEIGHT.bio, 'bio'))
  }
  for (const caption of signals.captions || []) {
    votes.push(...voteFromTokens(caption, WEIGHT.hashtag, 'hashtag'))
    votes.push(...voteFromProse(caption, WEIGHT.caption, 'caption'))
  }

  const empty: RegionDetection = { area: null, confidence: null, evidence: null, dominance: 0, alternates: [] }
  if (!votes.length) return empty

  const tally = new Map<string, { weight: number; labels: Set<string> }>()
  for (const v of votes) {
    const entry = tally.get(v.area) ?? { weight: 0, labels: new Set<string>() }
    entry.weight += v.weight
    entry.labels.add(v.label)
    tally.set(v.area, entry)
  }

  const ranked = [...tally.entries()].sort((a, b) => b[1].weight - a[1].weight)
  const total = ranked.reduce((sum, [, e]) => sum + e.weight, 0)
  const [topArea, topEntry] = ranked[0]
  const dominance = total > 0 ? topEntry.weight / total : 0

  // A creator who covers the whole country genuinely has no home province, and
  // saying so is more useful than naming whichever city they filmed in most
  // recently. Weight floor filters a single stray mention.
  // Two different ways to have no answer, and they need different words. A
  // travel creator naming six provinces is not the same as one stray mention,
  // and "gak ada yang dominan" on a single hit reads as a bug.
  if (dominance < 0.4 || topEntry.weight < 3) {
    return {
      area: null,
      confidence: null,
      evidence:
        ranked.length > 1
          ? `Nyebut ${ranked.length} daerah, gak ada yang dominan`
          : 'Sinyal lokasinya cuma lewat sekali, terlalu lemah',
      dominance,
      alternates: ranked.slice(0, 3).map(([a]) => a),
    }
  }

  const confidence: RegionConfidence = dominance >= 0.7 && topEntry.weight >= 6 ? 'tinggi' : dominance >= 0.55 ? 'sedang' : 'rendah'
  const labels = [...topEntry.labels].slice(0, 3).join(', ')

  return {
    area: topArea,
    confidence,
    evidence: labels || null,
    dominance: Math.round(dominance * 100) / 100,
    alternates: ranked.slice(1, 3).filter(([, e]) => e.weight >= topEntry.weight * 0.35).map(([a]) => a),
  }
}

/** Does a detection satisfy a requested filter? Unknown never passes a specific one. */
export function detectionMatches(d: RegionDetection, wanted: string | null): boolean {
  if (!wanted) return true
  if (!d.area) return false
  if (d.area === wanted) return true
  // Jabodetabek is a campaign scope, not a province: the satellite cities have
  // their own area id, and Jakarta itself is inside it. Jawa Barat is NOT — a
  // Bandung creator has no business in a Jabodetabek shortlist.
  if (wanted === 'jabodetabek') return d.area === 'dki-jakarta'
  if (wanted === 'dki-jakarta') return d.area === 'jabodetabek'
  const island = REGIONS.find((r) => r.id === d.area)?.island
  return island === wanted
}
