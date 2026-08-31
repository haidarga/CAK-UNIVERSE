'use client'

import { Search, Loader2, SlidersHorizontal } from 'lucide-react'
import { KOL_TIERS, type KolTier } from '@/lib/kol/tiers'
import { regionsByIsland, ISLANDS } from '@/lib/kol/regions'

// The search band. Deliberately NOT a boxed card.
//
// It reads as an editorial masthead — oversized input, generous vertical rhythm,
// filters as real segmented controls rather than a row of identical dropdowns.
// Tier is a multi-select of pills because tier is the filter people change most
// and it deserves to be one click, not a menu.

export interface KolFilterValue {
  query: string
  tiers: KolTier[]
  region: string | null
  country: string | null
  maxDaysInactive: number | null
  depth: 'cepat' | 'standar' | 'dalam'
}

const DEPTHS = [
  { id: 'cepat', label: 'Cepat', hint: '~30 dtk · sekitar 20 akun' },
  { id: 'standar', label: 'Standar', hint: '~1,5 mnt · sekitar 40 akun' },
  { id: 'dalam', label: 'Dalam', hint: '~4 mnt · sampai 70 akun' },
] as const

const ACTIVITY = [
  { value: 30, label: '30 hari' },
  { value: 90, label: '3 bulan' },
  { value: 180, label: '6 bulan' },
  { value: null, label: 'Semua' },
] as const

const inputClass =
  'w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-xs text-text transition-colors focus:border-primary/70 focus:outline-none focus:ring-1 focus:ring-primary/40'

export function KolFilters({
  value,
  onChange,
  onSubmit,
  busy,
}: {
  value: KolFilterValue
  onChange: (next: KolFilterValue) => void
  onSubmit: () => void
  busy: boolean
}) {
  const set = <K extends keyof KolFilterValue>(key: K, v: KolFilterValue[K]) => onChange({ ...value, [key]: v })

  const toggleTier = (tier: KolTier) =>
    set('tiers', value.tiers.includes(tier) ? value.tiers.filter((t) => t !== tier) : [...value.tiers, tier])

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!busy) onSubmit()
      }}
      className="space-y-5"
    >
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-mutedText/40" aria-hidden />
        <input
          value={value.query}
          onChange={(e) => set('query', e.target.value)}
          placeholder="#skincareindonesia, review skincare"
          aria-label="Hashtag atau kata kunci"
          spellCheck={false}
          className="w-full border-0 border-b border-border/50 bg-transparent py-2.5 pl-7 pr-3 text-xl font-medium text-text placeholder:text-mutedText/25 focus:border-primary/60 focus:outline-none sm:text-2xl"
        />
      </div>
      <p className="-mt-3 text-[11px] text-mutedText/60">
        Pisahin pakai koma buat nyisir beberapa sekaligus. Hashtag nemu kreator yang{' '}
        <em className="not-italic text-mutedText">beneran bikin</em> konten itu — kata kunci biasa nemu akun yang{' '}
        <em className="not-italic text-mutedText">namanya</em> mirip.
      </p>

      {/* Tier — the most-changed filter, so it costs one click and never hides
          in a menu. */}
      <div>
        <p className="mb-2 font-data text-[10px] uppercase tracking-[0.12em] text-mutedText/50">Tier</p>
        <div className="flex flex-wrap gap-1.5">
          {KOL_TIERS.map((tier) => {
            const on = value.tiers.includes(tier.id)
            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => toggleTier(tier.id)}
                aria-pressed={on}
                className={`group rounded-lg border px-3 py-1.5 text-left transition-[background-color,border-color,transform] duration-150 active:scale-[0.98] ${
                  on
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-border bg-surface hover:border-primary/40 hover:bg-primary/[0.03]'
                }`}
              >
                <span className={`block text-xs font-semibold ${on ? 'text-primary' : 'text-text/80'}`}>
                  {tier.label}
                </span>
                <span className="block font-data text-[10px] tabular-nums text-mutedText/50">{tier.blurb}</span>
              </button>
            )
          })}
        </div>
        {value.tiers.length === 0 && (
          <p className="mt-1.5 text-[10px] text-mutedText/40">Gak dipilih = semua tier ikut.</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="min-w-0">
          <label htmlFor="kol-region" className="mb-2 block font-data text-[10px] uppercase tracking-[0.12em] text-mutedText/50">
            Region
          </label>
          <select
            id="kol-region"
            value={value.region ?? ''}
            onChange={(e) => set('region', e.target.value || null)}
            className={inputClass}
          >
            <option value="">Semua Indonesia</option>
            <optgroup label="Per pulau">
              {ISLANDS.map((island) => (
                <option key={island} value={island}>{island}</option>
              ))}
            </optgroup>
            {regionsByIsland().map((group) => (
              <optgroup key={group.island} label={group.island}>
                {group.regions.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {/* Stated at the point of use, not buried in a help page: this filter
              behaves differently from the others and silence here would let it
              read as measured data. */}
          <p className="mt-1.5 text-[10px] leading-snug text-mutedText/45">
            Ditebak dari bio, dan kebanyakan kreator gak nulis kotanya. Milih region bakal
            nyembunyiin akun yang lokasinya gak ketahuan.
          </p>
        </div>

        <div className="min-w-0">
          <label htmlFor="kol-active" className="mb-2 block font-data text-[10px] uppercase tracking-[0.12em] text-mutedText/50">
            Masih aktif
          </label>
          <select
            id="kol-active"
            value={value.maxDaysInactive === null ? 'all' : String(value.maxDaysInactive)}
            onChange={(e) => set('maxDaysInactive', e.target.value === 'all' ? null : Number(e.target.value))}
            className={inputClass}
          >
            {ACTIVITY.map((a) => (
              <option key={a.label} value={a.value === null ? 'all' : String(a.value)}>
                Posting {a.label} terakhir
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[10px] leading-snug text-mutedText/45">
            Filter paling ngaruh. Akun mati sering nangkring di atas hashtag gara-gara satu
            video lama yang viral.
          </p>
        </div>

        <div className="min-w-0">
          <label htmlFor="kol-country" className="mb-2 block font-data text-[10px] uppercase tracking-[0.12em] text-mutedText/50">
            Negara
          </label>
          <select
            id="kol-country"
            value={value.country ?? ''}
            onChange={(e) => set('country', e.target.value || null)}
            className={inputClass}
          >
            <option value="ID">Indonesia doang</option>
            <option value="">Semua negara</option>
          </select>
          <p className="mt-1.5 text-[10px] leading-snug text-mutedText/45">
            Hashtag &ldquo;indonesia&rdquo; tetap kemasukan kreator Malaysia dan Thailand.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-border/40 pt-4">
        <div>
          <p className="mb-2 flex items-center gap-1.5 font-data text-[10px] uppercase tracking-[0.12em] text-mutedText/50">
            <SlidersHorizontal size={11} aria-hidden /> Kedalaman
          </p>
          <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
            {DEPTHS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => set('depth', d.id)}
                aria-pressed={value.depth === d.id}
                title={d.hint}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                  value.depth === d.id ? 'bg-primary/15 text-primary' : 'text-mutedText hover:text-text'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 font-data text-[10px] text-mutedText/40">
            {DEPTHS.find((d) => d.id === value.depth)?.hint}
          </p>
        </div>

        <button
          type="submit"
          disabled={busy || value.query.trim().length < 2}
          className="group inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-onPrimary transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Search size={15} aria-hidden />}
          {busy ? 'Lagi nyisir…' : 'Cari KOL'}
        </button>
      </div>
    </form>
  )
}
