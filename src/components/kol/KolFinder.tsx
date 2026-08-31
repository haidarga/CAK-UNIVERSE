'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Download, Info, Users } from 'lucide-react'
import { KolFilters, type KolFilterValue } from '@/components/kol/KolFilters'
import { KolProgress, type KolProgressState } from '@/components/kol/KolProgress'
import { KolRow } from '@/components/kol/KolRow'
import { KolShortlistBar } from '@/components/kol/KolShortlistBar'
import type { KolResult, KolSearchMeta } from '@/lib/kol/types'
import { elapsed } from '@/lib/kol/format'
import { createNdjsonParser, type KolStreamEvent } from '@/lib/kol/ndjson'

// "Mencari KOL yang Hilang" — hashtag or keyword in, shortlist out.
//
// Replaces the manual loop of scrolling a hashtag, opening every creator, and
// eyeballing whether they are the right size, still alive, and actually in the
// niche.
//
// Two things here are load-bearing and easy to mistake for polish:
//
//   1. The response is streamed NDJSON, so the ~90s sweep narrates itself from
//      real stage boundaries instead of sitting behind a spinner.
//   2. `meta` is rendered, not hidden. A tool that silently drops candidates
//      reads as "this niche only has 12 creators" when the truth is "we looked
//      at 61 and 49 did not match" — very different answers for a campaign plan.

const DEFAULTS: KolFilterValue = {
  platform: 'tiktok',
  query: '',
  tiers: [],
  region: null,
  country: 'ID',
  maxDaysInactive: 180,
  depth: 'standar',
}

type SortKey = 'skor' | 'follower' | 'engagement' | 'terbaru'

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'skor', label: 'Paling pas' },
  { id: 'follower', label: 'Follower' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'terbaru', label: 'Paling aktif' },
]

/**
 * Works out which filter emptied the result, and what single change undoes it.
 *
 * Ordered by how far up the funnel the loss happened: a candidate killed at
 * discovery never reached the tier filter, so blaming the tier would send the
 * reader to change the one control that was not responsible.
 */
function emptyReason(meta: KolSearchMeta, filters: KolFilterValue): {
  title: string
  detail: string
  fix?: { label: string; apply: (f: KolFilterValue) => KolFilterValue }
} {
  if (meta.candidatesFound === 0) {
    return {
      title: 'Hashtag-nya kosong',
      detail: 'Gak ada satu pun video di hashtag ini. Kemungkinan salah ketik, atau tag-nya emang belum kepakai. Coba ejaan lain.',
    }
  }

  const foreign = meta.droppedForeignEarly + meta.droppedByCountry
  if (foreign >= meta.candidatesFound * 0.6) {
    return {
      title: 'Hashtag ini isinya kreator luar negeri',
      detail: `${foreign} dari ${meta.candidatesFound} akun bukan dari Indonesia. Tag ini dipakai global, jadi filter "Indonesia doang" ngabisin semuanya. Coba versi Indonesia-nya — tambahin "indonesia" atau nama kota di belakang hashtag.`,
      fix: { label: 'Cari ulang tanpa batas negara', apply: (f) => ({ ...f, country: null }) },
    }
  }

  if (meta.droppedByTier > 0 && meta.droppedByTier >= meta.resolved * 0.5) {
    const tiers = Object.entries(meta.tierSpread).sort((a, b) => b[1] - a[1])
    return {
      title: 'Tier-nya kelewat sempit',
      detail: `${meta.droppedByTier} akun ketemu tapi ukurannya beda${tiers.length ? ` — paling banyak di tier ${tiers[0][0]} (${tiers[0][1]} akun)` : ''}. Di niche ini ukuran segitu yang banyak.`,
      fix: tiers.length
        ? {
            label: `Tambahin tier ${tiers[0][0]} (+${tiers[0][1]})`,
            apply: (f) => ({ ...f, tiers: [...f.tiers, tiers[0][0] as (typeof f.tiers)[number]] }),
          }
        : undefined,
    }
  }

  if (filters.region) {
    return {
      title: 'Filter region-nya kekencengan',
      detail:
        'Lokasi ditebak dari handle, bio, caption, dan hashtag — dan banyak kreator gak pernah nyebut kotanya sama sekali. Di niche yang gak terikat tempat (fashion, beauty, gaming), filter region bakal ngebuang hampir semua orang. Paling nendang di kuliner dan wisata.',
      fix: { label: 'Cari ulang tanpa filter region', apply: (f) => ({ ...f, region: null }) },
    }
  }

  if (filters.maxDaysInactive) {
    return {
      title: 'Semuanya udah lama gak posting',
      detail: `Ketemu ${meta.candidatesFound} akun tapi gak ada yang aktif belakangan ini. Hashtag ini kemungkinan udah mati.`,
      fix: { label: 'Tampilin yang udah gak aktif juga', apply: (f) => ({ ...f, maxDaysInactive: null }) },
    }
  }

  return {
    title: 'Gak ada yang lolos filter',
    detail: `Ketemu ${meta.candidatesFound} akun tapi semuanya kesaring. Coba longgarin salah satu filter di atas.`,
  }
}

export function KolFinder() {
  const [filters, setFilters] = useState<KolFilterValue>(DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<KolProgressState | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [results, setResults] = useState<KolResult[] | null>(null)
  const [meta, setMeta] = useState<KolSearchMeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortKey>('skor')
  const abortRef = useRef<AbortController | null>(null)

  // Elapsed clock. Stopped the moment the sweep ends so a finished search never
  // shows a ticking timer.
  useEffect(() => {
    if (!busy) return
    const started = Date.now()
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [busy])

  useEffect(() => () => abortRef.current?.abort(), [])

  const searchWith = useCallback(async (active: KolFilterValue) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setBusy(true)
    setError(null)
    setResults(null)
    setMeta(null)
    setSelected(new Set())
    setSeconds(0)
    setProgress(null)

    try {
      const res = await fetch('/api/kol/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          platform: active.platform,
          query: active.query,
          tiers: active.tiers,
          region: active.region,
          country: active.country,
          max_days_inactive: active.maxDaysInactive,
          depth: active.depth,
        }),
      })

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        throw new Error(text.slice(0, 200) || `Server balas ${res.status}`)
      }

      // NDJSON: one JSON object per line. The parser buffers because a network
      // chunk can end mid-line, and parsing eagerly would drop whichever event
      // straddles the boundary — including, occasionally, the final result.
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      const parser = createNdjsonParser()

      const apply = (events: KolStreamEvent[]) => {
        for (const event of events) {
          if (event.type === 'progress') {
            setProgress(event as unknown as KolProgressState)
          } else if (event.type === 'result') {
            setResults((event.results as KolResult[]) ?? [])
            setMeta((event.meta as KolSearchMeta) ?? null)
          } else if (event.type === 'error') {
            throw new Error(String(event.error || 'Pencarian gagal.'))
          }
        }
      }

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        apply(parser.push(decoder.decode(value, { stream: true })))
      }
      // A final line can arrive without a trailing newline.
      apply(parser.flush())
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Pencarian gagal.')
    } finally {
      // Only the CURRENT search may clear the busy state. A superseded call
      // reaches here after its abort and would otherwise switch off the progress
      // panel belonging to the search that replaced it — a live sweep that looks
      // finished, or hung.
      if (abortRef.current === controller) {
        setBusy(false)
        setProgress(null)
      }
    }
  }, [])

  const search = useCallback(() => searchWith(filters), [searchWith, filters])

  const toggle = useCallback((handle: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(handle)) next.delete(handle)
      else next.add(handle)
      return next
    })
  }, [])

  // Exact matches and near misses are rendered as separate sections. A near miss
  // is a fully measured creator who failed ONE filter, kept so a narrow filter
  // combination never produces a blank screen with nothing to judge.
  const matched = useMemo(() => (results ?? []).filter((r) => !r.missed && r.tierMatch !== false), [results])
  const near = useMemo(() => (results ?? []).filter((r) => r.missed || r.tierMatch === false), [results])

  const sortRows = useCallback((rows: KolResult[], key: SortKey) => {
    const copy = [...rows]
    switch (key) {
      case 'follower':
        return copy.sort((a, b) => (b.profile.followers ?? 0) - (a.profile.followers ?? 0))
      case 'engagement':
        return copy.sort((a, b) => (b.performance?.engagementRate ?? -1) - (a.performance?.engagementRate ?? -1))
      case 'terbaru':
        return copy.sort(
          (a, b) =>
            (a.performance?.daysSinceLastPost ?? Number.MAX_SAFE_INTEGER) -
            (b.performance?.daysSinceLastPost ?? Number.MAX_SAFE_INTEGER),
        )
      default:
        return copy // already ordered by the server's composite score
    }
  }, [])

  const sortedMatched = useMemo(() => sortRows(matched, sort), [sortRows, matched, sort])
  const sortedNear = useMemo(() => sortRows(near, sort), [sortRows, near, sort])

  const chosenResults = useMemo(
    () => (results ?? []).filter((r) => selected.has(r.profile.handle)),
    [results, selected],
  )

  const diagnosis = useMemo(() => emptyReason(meta ?? ({} as KolSearchMeta), filters), [meta, filters])

  const exportCsv = useCallback(() => {
    if (!results?.length) return
    const chosen = selected.size ? results.filter((r) => selected.has(r.profile.handle)) : results
    const head = ['platform', 'handle', 'nama', 'follower', 'tier', 'engagement_persen', 'rata_views', 'terakhir_posting_hari', 'niche_cocok', 'niche_total', 'region', 'keyakinan_region', 'negara', 'instagram', 'link']
    const rows = chosen.map((r) => [
      r.platform,
      r.profile.handle,
      r.profile.displayName ?? '',
      r.profile.followers ?? '',
      r.tier ?? '',
      r.performance?.engagementRate ?? '',
      r.performance?.avgViews ?? '',
      r.performance?.daysSinceLastPost ?? '',
      r.niche?.matched ?? '',
      r.niche?.total ?? '',
      r.region.area ?? '',
      r.region.confidence ?? '',
      r.profile.country ?? '',
      r.profile.instagramHandle ?? '',
      r.profile.profileUrl,
    ])
    const csv = [head, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `kol-${filters.query.replace(/[^a-z0-9]+/gi, '-').slice(0, 40) || 'hasil'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [results, selected, filters.query])

  return (
    <div className="space-y-7">
      <header className="max-w-2xl">
        <h2 className="text-lg font-semibold text-text">Mencari KOL yang Hilang</h2>
        <p className="mt-1 text-xs leading-relaxed text-mutedText">
          Masukin hashtag atau kata kunci, dapet shortlist KOL yang udah kesaring tier, keaktifan,
          dan konsistensi niche-nya — tanpa buka akun satu-satu.
        </p>
      </header>

      <KolFilters value={filters} onChange={setFilters} onSubmit={search} busy={busy} />

      {busy && <KolProgress state={progress} seconds={seconds} />}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.06] px-3 py-2.5 text-xs text-destructive">
          <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {results && meta && (
        <section className="space-y-4">
          {/* What the sweep actually did. Shown because a silently truncated
              result set is indistinguishable from a small niche. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border/40 py-3">
            {/* Just the answer. The funnel below carries the arithmetic — putting
                "131 ketemu" up here made it read as the result count. */}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-text">
                {matched.length} KOL cocok
                {near.length > 0 && <span className="font-normal text-mutedText/60"> · {near.length} mendekati</span>}
              </span>
              <span className="font-data text-[11px] text-mutedText/60">
                {elapsed(meta.elapsedMs)}
                {meta.fromCache > 0 && ` · ${meta.fromCache} dari cache`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSort(s.id)}
                    aria-pressed={sort === s.id}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 ${
                      sort === s.id ? 'bg-primary/15 text-primary' : 'text-mutedText hover:text-text'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={exportCsv}
                disabled={!results?.length}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px] font-medium text-mutedText transition-colors hover:border-border hover:text-text disabled:opacity-40"
              >
                <Download size={12} aria-hidden />
                {selected.size ? `Ekspor ${selected.size}` : 'Ekspor semua'}
              </button>
            </div>
          </div>

          {/* The funnel, and what to do about it.
              The first version said only "85 gak masuk filter", which reads as a
              failure and gives the reader nothing to act on — they cannot tell
              whether to widen the tier, drop the country filter, or abandon the
              hashtag. Every step now names its reason, and the tier rejects are
              broken down into one-click widen buttons. */}
          {(meta.filteredOut > 0 || meta.truncated || meta.warnings.length > 0) && (
            <div className="space-y-2 rounded-lg border border-border bg-surface px-3 py-3">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-data text-[11px] tabular-nums">
                <span className="text-mutedText">{meta.candidatesFound} ketemu</span>
                {meta.droppedForeignEarly > 0 && (
                  <>
                    <span className="text-mutedText/30">→</span>
                    <span className="text-destructive/70" title="Dibuang dari kode negara di videonya, sebelum dicek satu-satu">
                      −{meta.droppedForeignEarly} luar negeri
                    </span>
                  </>
                )}
                <span className="text-mutedText/30">→</span>
                <span className="text-mutedText">{meta.resolved} dicek</span>
                {meta.droppedByCountry > 0 && (
                  <>
                    <span className="text-mutedText/30">→</span>
                    <span className="text-destructive/70">−{meta.droppedByCountry} luar negeri</span>
                  </>
                )}
                {meta.droppedByRegion > 0 && (
                  <>
                    <span className="text-mutedText/30">→</span>
                    <span className="text-warning">−{meta.droppedByRegion} beda region</span>
                  </>
                )}
                {meta.droppedByActivity > 0 && (
                  <>
                    <span className="text-mutedText/30">→</span>
                    <span className="text-warning">−{meta.droppedByActivity} udah gak aktif</span>
                  </>
                )}
                <span className="text-mutedText/30">→</span>
                <span className="font-semibold text-text">{matched.length} cocok</span>
              </div>

              {meta.droppedByTier > 0 && (
                <p className="border-t border-border pt-2 text-[11px] text-mutedText/70">
                  {meta.droppedByTier} akun di luar tier yang kamu minta tetap ditampilin di bawah,
                  ditandai — biar keliatan siapa aja yang ada di niche ini.
                </p>
              )}

              {(meta.truncated || meta.warnings.length > 0) && (
                <ul className="space-y-1 border-t border-border pt-2">
                  {meta.truncated && (
                    <li className="flex items-start gap-2 text-[11px] text-mutedText/70">
                      <Info size={12} className="mt-px shrink-0 text-mutedText/40" aria-hidden />
                      {meta.truncated}
                    </li>
                  )}
                  {meta.warnings.map((w) => (
                    <li key={w} className="flex items-start gap-2 text-[11px] text-mutedText/70">
                      <Info size={12} className="mt-px shrink-0 text-mutedText/40" aria-hidden />
                      {w}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {sortedMatched.length === 0 && sortedNear.length === 0 ? (
            /* Name the filter that actually did it, and offer the one control
               that undoes it. "Semuanya kesaring, coba longgarin sesuatu" makes
               the reader re-run blind — which is how a working filter ends up
               looking like a broken tool. */
            <div className="rounded-xl border border-dashed border-border/50 px-4 py-10 text-center">
              <Users size={22} className="mx-auto mb-2 text-mutedText/30" aria-hidden />
              <p className="text-sm font-medium text-text/80">{diagnosis.title}</p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-mutedText/60">{diagnosis.detail}</p>
              {diagnosis.fix && (
                <button
                  type="button"
                  onClick={() => {
                    const next = diagnosis.fix!.apply(filters)
                    setFilters(next)
                    setTimeout(() => searchWith(next), 0)
                  }}
                  className="mt-3 rounded-lg border border-primary/50 bg-primary/[0.06] px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                >
                  {diagnosis.fix.label}
                </button>
              )}
            </div>
          ) : (
            <>
              {sortedMatched.length > 0 && (
                <ul className="space-y-1.5">
                  {sortedMatched.map((result, i) => (
                    <KolRow
                      key={result.profile.handle}
                      result={result}
                      index={i}
                      selected={selected.has(result.profile.handle)}
                      onToggle={toggle}
                    />
                  ))}
                </ul>
              )}

              {sortedNear.length > 0 && (
                <section className="pt-2">
                  <div className="mb-2 flex items-center gap-3">
                    <h3 className="shrink-0 text-xs font-semibold text-mutedText">
                      {sortedMatched.length > 0 ? 'Gak persis cocok, tapi ada' : 'Yang paling mendekati'}
                    </h3>
                    <span className="h-px flex-1 bg-border" aria-hidden />
                    <span className="shrink-0 font-data text-[11px] tabular-nums text-mutedText/50">
                      {sortedNear.length}
                    </span>
                  </div>
                  <p className="mb-2 text-[11px] leading-relaxed text-mutedText/60">
                    Kreator ini beneran ada di niche yang kamu cari dan datanya udah diukur — cuma
                    meleset di satu filter. Tiap barisnya ditandai melesetnya di mana.
                  </p>
                  <ul className="space-y-1.5">
                    {sortedNear.map((result, i) => (
                      <KolRow
                        key={result.profile.handle}
                        result={result}
                        index={sortedMatched.length + i}
                        selected={selected.has(result.profile.handle)}
                        onToggle={toggle}
                      />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          <p className="flex items-start gap-2 text-[10px] leading-relaxed text-mutedText/45">
            <Info size={11} className="mt-px shrink-0" aria-hidden />
            Engagement dihitung dari likes ÷ views di feed asli tiap kreator, bukan dari feed
            hashtag — feed hashtag diurutin berdasarkan yang viral, jadi akun mati sering
            kelihatan bagus di situ. Follower dan negara itu data terukur; lokasi provinsi cuma
            tebakan dari bio. Demografi follower gak tersedia dari sumber publik mana pun.
          </p>
        </section>
      )}

      <KolShortlistBar selected={chosenResults} onClear={() => setSelected(new Set())} onExport={exportCsv} />

      {!busy && !results && !error && (
        <div className="rounded-xl border border-dashed border-border/40 px-4 py-12 text-center">
          <p className="text-sm font-medium text-text/70">Mau cari KOL di niche apa?</p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {['#skincareindonesia', '#gamingindonesia', 'kuliner jakarta', '#ootdindo'].map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setFilters((f) => ({ ...f, query: example }))}
                className="rounded-full border border-border/50 px-3 py-1 font-data text-[11px] text-mutedText transition-colors hover:border-primary/50 hover:text-primary"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
