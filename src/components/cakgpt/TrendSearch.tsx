'use client'

import { useState } from 'react'
import { Search, TrendingUp, ExternalLink, Copy, Check, Loader2, Lightbulb } from 'lucide-react'
import { fmtCompact } from '@/lib/utils'

// Mirrors ResearchItem from @/lib/research (kept local to avoid importing a
// server lib into a client component).
type Platform = 'tiktok' | 'instagram' | 'youtube' | 'sge'
interface TrendItem {
  platform: Platform
  url: string
  title?: string
  thumbnail?: string
  views?: number
  likes?: number
  engagementRate?: number
  score: number
}

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'tiktok', label: 'TikTok' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'sge', label: 'SGE' },
]

const PLATFORM_BADGE: Record<Platform, string> = {
  tiktok: 'bg-zinc-900 text-white',
  instagram: 'bg-pink-600 text-white',
  youtube: 'bg-red-600 text-white',
  sge: 'bg-primary text-onPrimary',
}

export function TrendSearch({ onUseIdea }: { onUseIdea?: (seed: string) => void }) {
  const [topic, setTopic] = useState('')
  const [active, setActive] = useState<Set<Platform>>(new Set(PLATFORMS.map((p) => p.id)))
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<TrendItem[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [ran, setRan] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  function toggle(p: Platform) {
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next.size ? next : prev // never allow zero platforms
    })
  }

  async function search(e?: React.FormEvent) {
    e?.preventDefault()
    const q = topic.trim()
    if (!q || loading) return
    setLoading(true)
    setRan(true)
    try {
      const res = await fetch('/api/scriptwriter/trends', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic: q, platforms: Array.from(active) }),
      })
      const json = await res.json()
      if (json?.success) {
        setItems(json.data.items ?? [])
        setErrors(json.data.errors ?? {})
      } else {
        setItems([])
        setErrors({ _: json?.error ?? 'Gagal ambil trending' })
      }
    } catch (err) {
      setItems([])
      setErrors({ _: err instanceof Error ? err.message : 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  async function copy(it: TrendItem) {
    const text = `${it.title ?? it.url}\n${it.url}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(it.url)
      setTimeout(() => setCopied((c) => (c === it.url ? null : c)), 1500)
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={search} className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mutedText"
              aria-hidden
            />
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={200}
              placeholder="Cari topik trending… (mis. skincare lokal, thrifting, mobil listrik)"
              className="w-full rounded-lg border border-border bg-surface py-2.5 pl-9 pr-3 text-sm text-text outline-none placeholder:text-mutedText focus:border-primary"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !topic.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-onPrimary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <TrendingUp size={16} />}
            {loading ? 'Nyari…' : 'Cari'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PLATFORMS.map((p) => {
            const on = active.has(p.id)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                aria-pressed={on}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  on
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-surface text-mutedText hover:text-text'
                }`}
              >
                {p.label}
              </button>
            )
          })}
          <span className="ml-1 text-xs text-mutedText">
            live scrape · bisa beberapa detik
          </span>
        </div>
      </form>

      {/* Per-platform / global errors (soft — partial results still show) */}
      {Object.keys(errors).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(errors).map(([k, v]) => (
            <span
              key={k}
              className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] text-mutedText"
            >
              {k === '_' ? '' : `${k}: `}
              {v}
            </span>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-8 text-sm text-mutedText">
          <Loader2 size={16} className="animate-spin" /> Ngumpulin konten viral dari{' '}
          {Array.from(active).join(', ')}…
        </div>
      )}

      {!loading && ran && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-mutedText">
          Gak ada hasil. Coba topik lain atau aktifin platform lain.
          <br />
          <span className="text-[11px]">
            (TikTok/IG/SGE butuh scraper aktif di server; YouTube butuh API key.)
          </span>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <div
              key={it.url}
              className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface"
            >
              {it.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.thumbnail}
                  alt=""
                  className="h-40 w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-40 w-full items-center justify-center bg-muted text-mutedText">
                  <TrendingUp size={28} aria-hidden />
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PLATFORM_BADGE[it.platform]}`}
                  >
                    {it.platform}
                  </span>
                  <span className="font-data text-[11px] text-mutedText">
                    skor {Math.round(it.score)}
                  </span>
                </div>
                <p className="line-clamp-2 flex-1 text-sm text-text">
                  {it.title?.trim() || it.url}
                </p>
                <div className="flex items-center gap-3 font-data text-[11px] text-mutedText">
                  {it.views != null && <span>{fmtCompact(it.views)} views</span>}
                  {it.likes != null && <span>{fmtCompact(it.likes)} likes</span>}
                  {it.engagementRate != null && (
                    <span>{(it.engagementRate * 100).toFixed(1)}% eng</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-mutedText hover:text-text"
                  >
                    <ExternalLink size={13} /> Buka
                  </a>
                  <button
                    type="button"
                    onClick={() => copy(it)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-mutedText hover:text-text"
                  >
                    {copied === it.url ? <Check size={13} /> : <Copy size={13} />}
                    {copied === it.url ? 'Tersalin' : 'Salin'}
                  </button>
                  {onUseIdea && (
                    <button
                      type="button"
                      onClick={() => onUseIdea(`${it.title?.trim() || it.url} (${it.platform})`)}
                      className="inline-flex items-center gap-1 rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                    >
                      <Lightbulb size={13} /> Pakai
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
