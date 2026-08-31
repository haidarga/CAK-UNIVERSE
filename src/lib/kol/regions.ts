// Indonesian region taxonomy for the KOL filter.
//
// This file is the MAP ONLY — which areas exist, what they are called, and how
// they group by island. The detection logic lives in region-detect.ts, which
// votes across a creator's handle, bio, captions and post geo tags.
//
// One limit is permanent and belongs here: follower demographics — "followers-nya
// dominan daerah mana" — cannot be obtained. That data exists only inside the
// creator's own Insights, so no scraper reaches it, and nothing in this codebase
// should ever present a number for it.

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
  // The satellite cities belong to Jabodetabek ALONE, not also to their legal
  // provinces. Listing Bekasi under both here and Jawa Barat made one creator
  // vote for two areas at once, and let a Bandung creator pass a Jabodetabek
  // filter. Campaign scope beats administrative accuracy: nobody briefing
  // "Jabodetabek" means Bandung, and nobody briefing "Jawa Barat" is upset to
  // miss Depok.
  { id: 'jabodetabek', label: 'Jabodetabek', island: 'Jawa', aliases: ['jabodetabek', 'bogor', 'depok', 'tangerang', 'tangsel', 'bekasi', 'bsd', 'serpong', 'cibubur', 'cikarang'] },
  { id: 'dki-jakarta', label: 'DKI Jakarta', island: 'Jawa', aliases: ['dki jakarta', 'jakarta', 'jkt', 'jaksel', 'jakbar', 'jaktim', 'jakut', 'jakpus'] },
  { id: 'jawa-barat', label: 'Jawa Barat', island: 'Jawa', aliases: ['jawa barat', 'jabar', 'bandung', 'bdg', 'cirebon', 'sukabumi', 'garut', 'tasikmalaya', 'karawang', 'cimahi', 'soreang', 'lembang'] },
  { id: 'banten', label: 'Banten', island: 'Jawa', aliases: ['banten', 'serang', 'cilegon', 'pandeglang'] },
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
