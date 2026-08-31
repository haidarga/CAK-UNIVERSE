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

// Inside a hashtag or handle there is no grammar to lean on, so an ambiguous
// word needs a companion that makes it a PLACE. "#kulinersolo" and "#exploresolo"
// are Surakarta; "#solotravel" and "@soloqueen_mua" are not.
//
// Without this the guard only covered prose, and a handle vote — the second
// heaviest signal there is — assigned Solo to @soloqueen_mua at "tinggi"
// confidence off one unrelated English word.
const LOCALITY_MARKERS = [
  'kuliner', 'wisata', 'explore', 'eksplor', 'jajanan', 'kota', 'kab', 'info', 'seputar',
  'makan', 'cafe', 'kafe', 'resto', 'warung', 'hotel', 'tempat', 'liburan', 'pasar',
  'event', 'daerah', 'asli', 'khas', 'orang', 'anak', 'warga', 'update',
]

// What each kind of evidence is worth. A GPS tag beats a passing mention by a
// wide margin, and one hashtag the creator chose for themselves beats several
// incidental words.
const WEIGHT = { geo: 8, handle: 6, hashtag: 3, bio: 6, caption: 1, mention: 4, dialect: 2 } as const

// Regional speech, which is the only signal that reaches creators who never name
// a place at all — the majority in beauty, fashion and comedy. It cannot point
// at a city, only at a province or island, and that is exactly how it is used:
// a supporting vote, never strong enough to decide on its own.
//
// Words are chosen for being distinctive rather than common: "aing" and "pisan"
// are unmistakably Sundanese, while "aku" or "kamu" say nothing.
const DIALECTS: { area: string; words: string[] }[] = [
  // Removed after review, each for being ordinary language rather than a marker:
  //   "teh"  — the drink. "es teh manis" appears in half of all food captions.
  //   "iso"  — the camera setting, in every photography caption ever written.
  //   "ndak" — casual nationwide Indonesian for "tidak", not Central Java.
  //   "side" — an English loanword, unrelated to NTB/NTT speech.
  // A false dialect hit does not merely fail to corroborate: its weight still
  // counts toward the dominance ratio and can tip the winner to the wrong
  // province. False positives cost more here than missing coverage.
  { area: 'jawa-barat', words: ['pisan', 'atuh', 'euy', 'aing', 'kumaha', 'meuni', 'cenah', 'kunaon'] },
  { area: 'jawa-timur', words: ['rek', 'arek', 'sampeyan', 'jancok', 'lapo', 'ndhak'] },
  { area: 'jawa-tengah', words: ['piye', 'ojo', 'monggo', 'tenan', 'ngoten', 'mboten'] },
  { area: 'yogyakarta', words: ['jogjaku', 'ngayogyakarta', 'gumbira'] },
  { area: 'sumatera-utara', words: ['bah', 'kali ya', 'awak', 'horas', 'lae', 'namboru'] },
  { area: 'sumatera-barat', words: ['uda', 'uni', 'baa', 'lai', 'rancak'] },
  { area: 'sumatera-selatan', words: ['ngapo', 'cak mano', 'kito', 'wong kito'] },
  { area: 'sulawesi-utara', words: ['torang', 'kita pe', 'so pigi', 'nyanda'] },
  { area: 'sulawesi-selatan', words: ['tawwa', 'mi ki', 'cika', 'anjo'] },
  { area: 'bali', words: ['nggih', 'suksma', 'rahajeng', 'om swastiastu'] },
  { area: 'nusa-tenggara', words: ['sasak', 'aok'] },
  { area: 'maluku', words: ['beta', 'katong', 'dong pu'] },
  { area: 'papua', words: ['sa pu', 'ko pu', 'tong pu'] },
]

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

// `strong` marks evidence a creator put there deliberately about THEMSELVES —
// a geotag, their handle, their bio. A caption or hashtag is circumstantial:
// one of them is a passing mention, several are a pattern.
type Vote = { area: string; weight: number; label: string; strong?: boolean; deliberate?: boolean }

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
      if (!token.includes(alias)) continue
      // An ambiguous word only counts when the rest of the token marks it as a
      // place. Checked against the token with the alias removed, so "#solotravel"
      // cannot satisfy the guard using letters that belong to "solo" itself.
      if (AMBIGUOUS.has(alias)) {
        const rest = token.split(alias).join('')
        if (!LOCALITY_MARKERS.some((m) => rest.includes(m))) continue
      }
      // A location hashtag is typed on purpose. A city that merely appears in a
      // sentence is not, and one of those proves nothing on its own.
      votes.push({ area, weight, label: kind === 'hashtag' ? `#${token}` : `handle @${text}`, deliberate: true })
      break // one vote per token; the longest alias already won
    }
  }
  return votes
}

/**
 * Votes from @mentions.
 *
 * Substring matching is safe inside a mention for the same reason it is safe
 * inside a hashtag: @kopi_toko_djawa_bandung is a handle someone chose, not a
 * sentence that happened to contain a city.
 */
function voteFromMentions(text: string, weight: number): Vote[] {
  const mentions = (text.toLowerCase().match(/@[a-z0-9._]{3,30}/g) || []).map((m) => m.slice(1).replace(/[._]/g, ''))
  const votes: Vote[] = []
  for (const handle of mentions) {
    for (const { area, alias } of COMPACT_ALIASES) {
      if (!handle.includes(alias)) continue
      if (AMBIGUOUS.has(alias)) continue // no sentence context to disambiguate
      votes.push({ area, weight, label: `mention @${handle}`, deliberate: true })
      break
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
    votes.push(...voteFromProse(tag, WEIGHT.geo, `lokasi post "${tag}"`).map((v) => ({ ...v, strong: true })))
  }
  if (signals.handle) {
    votes.push(...voteFromTokens(signals.handle, WEIGHT.handle, 'handle').map((v) => ({ ...v, strong: true })))
  }
  if (signals.bio) {
    votes.push(...voteFromTokens(signals.bio, WEIGHT.hashtag, 'hashtag').map((v) => ({ ...v, strong: true })))
    votes.push(...voteFromProse(signals.bio, WEIGHT.bio, 'bio').map((v) => ({ ...v, strong: true })))
  }
  for (const caption of signals.captions || []) {
    votes.push(...voteFromTokens(caption, WEIGHT.hashtag, 'hashtag'))
    votes.push(...voteFromProse(caption, WEIGHT.caption, 'caption'))
    // An @mention is usually a LOCAL BUSINESS the creator visited, and a shop
    // name carries its city far more often than the creator's own prose does:
    // @noahs_barn_bandung exists once in the world.
    votes.push(...voteFromMentions(caption, WEIGHT.mention))
  }

  // Dialect last, and deliberately never `strong` or `deliberate`: it corroborates,
  // it does not decide.
  const speech = [signals.bio || '', ...(signals.captions || [])].join(' ').toLowerCase()
  for (const { area, words } of DIALECTS) {
    const hit = words.find((w) => wordHit(speech, w))
    if (hit) votes.push({ area, weight: WEIGHT.dialect, label: `logat "${hit}"` })
  }

  const empty: RegionDetection = { area: null, confidence: null, evidence: null, dominance: 0, alternates: [] }
  if (!votes.length) return empty

  const tally = new Map<string, { weight: number; labels: Set<string>; strong: boolean; deliberate: boolean; count: number }>()
  for (const v of votes) {
    const entry = tally.get(v.area) ?? { weight: 0, labels: new Set<string>(), strong: false, deliberate: false, count: 0 }
    entry.weight += v.weight
    entry.count += 1
    entry.strong = entry.strong || !!v.strong
    entry.deliberate = entry.deliberate || !!v.deliberate
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
  // Evidence, not just arithmetic.
  //
  // A weight threshold alone could not tell "one stray caption" from "one
  // explicit hashtag", and raising it far enough to kill the first also killed
  // the second. What actually separates them is corroboration: something the
  // creator said about themselves (geotag, handle, bio), a location hashtag they
  // typed on purpose, or the same place across at least two posts. A city that
  // merely drifts through one sentence is noise wearing a province name.
  const corroborated = topEntry.strong || topEntry.deliberate || topEntry.count >= 2
  if (dominance < 0.55 || !corroborated) {
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
