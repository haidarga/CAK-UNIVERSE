// Indonesian region taxonomy for the KOL filter.
//
// IMPORTANT — read before wiring this to anything:
//
// The scraper gives us a COUNTRY code and nothing else. Probed live across 58
// Indonesian TikTok creators: country was present on every one of them, while an
// explicit city in the bio appeared on ZERO. Province and city therefore cannot
// be measured, only guessed from bio text, and the guess usually fails.
//
// So this taxonomy exists to (a) filter Indonesia against the Malaysian and Thai
// creators that leak into every "indonesia" hashtag, and (b) label the guess
// when a bio does happen to name a place. It never invents a location, and the
// UI must show WHERE a location came from so nobody mistakes a guess for data.
//
// Follower demographics — "followers-nya dominan daerah mana" — are absent
// entirely, because that data exists only inside the creator's own Insights.
// No scraper can reach it.

export type RegionSource = 'bio' | 'none'

export interface RegionGuess {
  /** Province/area id from REGIONS, or null when nothing was found. */
  area: string | null
  source: RegionSource
  /** The literal bio fragment that triggered the match, for showing our work. */
  evidence?: string | null
}

interface RegionDef {
  id: string
  label: string
  island: string
  /** Lowercase spellings and nicknames as they actually appear in bios. */
  aliases: string[]
}

export const ISLANDS = ['Jawa', 'Sumatera', 'Kalimantan', 'Sulawesi', 'Bali & Nusa Tenggara', 'Papua & Maluku'] as const

// Jabodetabek leads because it is the most requested scope and deliberately
// spans three provinces — a campaign brief says "Jabodetabek", never "DKI
// Jakarta plus parts of Jawa Barat plus Banten".
export const REGIONS: RegionDef[] = [
  { id: 'jabodetabek', label: 'Jabodetabek', island: 'Jawa', aliases: ['jabodetabek', 'jakarta', 'jkt', 'bogor', 'depok', 'tangerang', 'tangsel', 'bekasi', 'bsd', 'serpong'] },
  { id: 'dki-jakarta', label: 'DKI Jakarta', island: 'Jawa', aliases: ['dki jakarta', 'jakarta', 'jkt', 'jaksel', 'jakbar', 'jaktim', 'jakut', 'jakpus'] },
  { id: 'jawa-barat', label: 'Jawa Barat', island: 'Jawa', aliases: ['jawa barat', 'jabar', 'bandung', 'bdg', 'cirebon', 'sukabumi', 'garut', 'tasikmalaya', 'karawang', 'cimahi'] },
  { id: 'banten', label: 'Banten', island: 'Jawa', aliases: ['banten', 'serang', 'cilegon'] },
  { id: 'jawa-tengah', label: 'Jawa Tengah', island: 'Jawa', aliases: ['jawa tengah', 'jateng', 'semarang', 'solo', 'surakarta', 'magelang', 'pekalongan', 'kudus', 'salatiga', 'purwokerto', 'tegal'] },
  { id: 'yogyakarta', label: 'DI Yogyakarta', island: 'Jawa', aliases: ['yogyakarta', 'yogya', 'jogja', 'jogjakarta', 'sleman', 'bantul'] },
  { id: 'jawa-timur', label: 'Jawa Timur', island: 'Jawa', aliases: ['jawa timur', 'jatim', 'surabaya', 'sby', 'malang', 'sidoarjo', 'gresik', 'kediri', 'jember', 'madiun', 'banyuwangi'] },
  { id: 'sumatera-utara', label: 'Sumatera Utara', island: 'Sumatera', aliases: ['sumatera utara', 'sumut', 'medan', 'binjai', 'pematangsiantar'] },
  { id: 'sumatera-barat', label: 'Sumatera Barat', island: 'Sumatera', aliases: ['sumatera barat', 'sumbar', 'padang', 'bukittinggi', 'payakumbuh'] },
  { id: 'sumatera-selatan', label: 'Sumatera Selatan', island: 'Sumatera', aliases: ['sumatera selatan', 'sumsel', 'palembang', 'lubuklinggau'] },
  { id: 'riau', label: 'Riau & Kepri', island: 'Sumatera', aliases: ['riau', 'pekanbaru', 'kepri', 'batam', 'tanjung pinang', 'dumai'] },
  { id: 'lampung', label: 'Lampung', island: 'Sumatera', aliases: ['lampung'] },
  { id: 'aceh', label: 'Aceh', island: 'Sumatera', aliases: ['aceh', 'lhokseumawe'] },
  { id: 'jambi-bengkulu', label: 'Jambi & Bengkulu', island: 'Sumatera', aliases: ['jambi', 'bengkulu'] },
  { id: 'kalimantan-timur', label: 'Kalimantan Timur', island: 'Kalimantan', aliases: ['kalimantan timur', 'kaltim', 'samarinda', 'balikpapan', 'bontang'] },
  { id: 'kalimantan-selatan', label: 'Kalimantan Selatan', island: 'Kalimantan', aliases: ['kalimantan selatan', 'kalsel', 'banjarmasin', 'banjarbaru'] },
  { id: 'kalimantan-barat', label: 'Kalimantan Barat', island: 'Kalimantan', aliases: ['kalimantan barat', 'kalbar', 'pontianak', 'singkawang'] },
  { id: 'kalimantan-tengah', label: 'Kalimantan Tengah & Utara', island: 'Kalimantan', aliases: ['kalimantan tengah', 'kalteng', 'palangkaraya', 'kalimantan utara', 'kaltara', 'tarakan'] },
  { id: 'sulawesi-selatan', label: 'Sulawesi Selatan', island: 'Sulawesi', aliases: ['sulawesi selatan', 'sulsel', 'makassar', 'parepare', 'palopo'] },
  { id: 'sulawesi-utara', label: 'Sulawesi Utara', island: 'Sulawesi', aliases: ['sulawesi utara', 'sulut', 'manado', 'bitung', 'tomohon'] },
  { id: 'sulawesi-lain', label: 'Sulawesi Lainnya', island: 'Sulawesi', aliases: ['sulawesi tengah', 'sulteng', 'palu', 'sulawesi tenggara', 'sultra', 'kendari', 'gorontalo', 'sulawesi barat', 'mamuju'] },
  { id: 'bali', label: 'Bali', island: 'Bali & Nusa Tenggara', aliases: ['bali', 'denpasar', 'ubud', 'canggu', 'kuta', 'seminyak', 'badung', 'gianyar'] },
  { id: 'nusa-tenggara', label: 'NTB & NTT', island: 'Bali & Nusa Tenggara', aliases: ['ntb', 'lombok', 'mataram', 'sumbawa', 'ntt', 'kupang', 'flores', 'labuan bajo'] },
  { id: 'papua', label: 'Papua', island: 'Papua & Maluku', aliases: ['papua', 'jayapura', 'sorong', 'merauke', 'timika', 'manokwari'] },
  { id: 'maluku', label: 'Maluku', island: 'Papua & Maluku', aliases: ['maluku', 'ambon', 'ternate', 'tidore'] },
]

export const REGION_IDS = REGIONS.map((r) => r.id)

export function regionLabel(id: string | null): string {
  if (!id) return '—'
  return REGIONS.find((r) => r.id === id)?.label ?? id
}

/** REGIONS grouped by island, for a two-level dropdown. */
export function regionsByIsland(): { island: string; regions: RegionDef[] }[] {
  return ISLANDS.map((island) => ({ island, regions: REGIONS.filter((r) => r.island === island) }))
}

// Word-ish boundaries rather than bare `includes`: "bali" must not match
// "balikpapan" and "solo" must not match "solopreneur" — both are real bios we
// would otherwise mislabel.
function mentions(haystack: string, alias: string): string | null {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i')
  return re.test(haystack) ? alias : null
}

/**
 * Best-effort location guess from bio text.
 *
 * Returns `source: 'none'` far more often than not — measured at 0 of 58 on a
 * real skincare cohort. That empty result is the honest answer, and callers must
 * render it as unknown rather than falling back to a default region.
 */
export function guessRegionFromBio(bio: string | null | undefined): RegionGuess {
  const text = (bio || '').toLowerCase()
  if (!text.trim()) return { area: null, source: 'none' }

  // Specific provinces are checked before the Jabodetabek umbrella so a bio
  // saying "Bandung" is not swallowed by shared aliases. Jabodetabek goes last
  // precisely because it is the broadest.
  const jabo = REGIONS.find((r) => r.id === 'jabodetabek')!
  const ordered = [...REGIONS.filter((r) => r.id !== 'jabodetabek'), jabo]
  for (const region of ordered) {
    for (const alias of region.aliases) {
      const hit = mentions(text, alias)
      if (hit) return { area: region.id, source: 'bio', evidence: hit }
    }
  }
  return { area: null, source: 'none' }
}

/** Does a guessed area satisfy a requested filter? Unknown never passes a specific filter. */
export function regionMatches(guess: RegionGuess, wanted: string | null): boolean {
  if (!wanted) return true
  if (!guess.area) return false
  if (guess.area === wanted) return true
  // Jabodetabek is an umbrella: DKI Jakarta sits inside it.
  if (wanted === 'jabodetabek' && guess.area === 'dki-jakarta') return true
  // An island filter accepts every province on that island.
  if ((ISLANDS as readonly string[]).includes(wanted)) {
    return REGIONS.find((r) => r.id === guess.area)?.island === wanted
  }
  return false
}
