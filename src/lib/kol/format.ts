// Presentation helpers. Client-safe — no server imports.
//
// One rule runs through all of them: a value we do not have renders as an em
// dash, never as 0, "N/A", or a hopeful default. The whole feature's credibility
// rests on the reader being able to tell "measured" from "unknown" at a glance.

export const EMPTY = '—'

/** 1.234 · 12,3rb · 1,2jt — Indonesian shorthand, because the reader scans dozens of these. */
export function compactCount(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return EMPTY
  if (n < 1_000) return String(n)
  if (n < 1_000_000) {
    const v = n / 1_000
    return `${(v < 10 ? v.toFixed(1) : Math.round(v).toString()).replace('.', ',')}rb`
  }
  const v = n / 1_000_000
  return `${(v < 10 ? v.toFixed(1) : Math.round(v).toString()).replace('.', ',')}jt`
}

export function fullCount(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return EMPTY
  return n.toLocaleString('id-ID')
}

export function percent(n: number | null | undefined, digits = 1): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return EMPTY
  return `${n.toFixed(digits).replace('.', ',')}%`
}

/** "hari ini" · "3 hari lalu" · "5 bulan lalu" — recency is the strongest quality signal here. */
export function sinceDays(days: number | null | undefined): string {
  if (typeof days !== 'number' || !Number.isFinite(days)) return EMPTY
  if (days <= 0) return 'hari ini'
  if (days === 1) return 'kemarin'
  if (days < 30) return `${days} hari lalu`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} bulan lalu`
  const years = Math.floor(months / 12)
  return `${years} tahun lalu`
}

/** "tiap 3 hari" · "tiap 2 minggu" — cadence reads better as a rhythm than a decimal. */
export function cadence(days: number | null | undefined): string {
  if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) return EMPTY
  if (days < 1.5) return 'tiap hari'
  if (days < 10) return `tiap ${Math.round(days)} hari`
  const weeks = Math.round(days / 7)
  if (weeks < 8) return `tiap ${weeks} minggu`
  return `tiap ${Math.round(days / 30)} bulan`
}

export function elapsed(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} detik`
  return `${Math.floor(s / 60)} menit ${s % 60} detik`
}

/**
 * Engagement as a fraction of a "strong for this tier" bar, clamped to 0–1.
 *
 * Drives a bar rather than a bare percentage because 3,2% means nothing on its
 * own — it means something only next to what is normal for accounts that size.
 */
export function engagementFill(er: number | null | undefined, floor: number): number {
  if (typeof er !== 'number' || !Number.isFinite(er) || floor <= 0) return 0
  return Math.max(0, Math.min(1, er / (floor * 2)))
}

/** Country codes seen in real sweeps. Anything unlisted falls back to the raw code. */
const COUNTRY_NAMES: Record<string, string> = {
  ID: 'Indonesia', MY: 'Malaysia', SG: 'Singapura', TH: 'Thailand', PH: 'Filipina',
  VN: 'Vietnam', US: 'Amerika', GB: 'Inggris', AU: 'Australia', JP: 'Jepang',
  KR: 'Korea', CN: 'Tiongkok', IN: 'India', BD: 'Bangladesh', TR: 'Turki',
  CA: 'Kanada', FR: 'Prancis', DE: 'Jerman', NL: 'Belanda', BR: 'Brasil',
}

export function countryName(code: string | null | undefined): string {
  if (!code) return EMPTY
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase()
}

/** Where a candidate came from — kept visible because it predicts result quality. */
export const SOURCE_LABELS: Record<string, string> = {
  hashtag: 'dari hashtag',
  'keyword-video': 'dari video',
  'keyword-user': 'dari nama akun',
}
