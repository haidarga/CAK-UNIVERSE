'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BookmarkPlus, Check, Loader2, Trash2, X } from 'lucide-react'
import type { KolResult } from '@/lib/kol/types'
import { compactCount } from '@/lib/kol/format'

// The action bar that appears once creators are ticked.
//
// It docks to the bottom of the viewport rather than sitting at the top of the
// list, because selection happens while scrolling through fifty rows and a
// control that has scrolled away is a control that does not exist.
//
// Saving stores a SNAPSHOT of each creator's numbers, not a reference. Follower
// counts move and creators go quiet; a shortlist has to stay an accurate record
// of what was true when the pick was made, or a campaign post-mortem cannot
// separate a bad choice from a creator who changed afterwards.

export interface Shortlist {
  id: string
  name: string
  note: string | null
  entries: unknown[]
  updated_at: string
}

function snapshot(r: KolResult) {
  return {
    handle: r.profile.handle,
    platform: r.platform,
    display_name: r.profile.displayName,
    followers: r.profile.followers,
    tier: r.tier,
    engagement_rate: r.performance?.engagementRate ?? null,
    avg_views: r.performance?.avgViews ?? null,
    days_since_last_post: r.performance?.daysSinceLastPost ?? null,
    region: r.region.area,
    region_confidence: r.region.confidence,
    niche_matched: r.niche?.matched ?? null,
    niche_total: r.niche?.total ?? null,
    country: r.profile.country,
    // On an Instagram search this equals the handle itself, so it would fill
    // the column with self-links.
    instagram_handle: r.platform === 'instagram' ? null : r.profile.instagramHandle,
    profile_url: r.profile.profileUrl,
  }
}

export function KolShortlistBar({
  selected,
  onClear,
  onExport,
}: {
  selected: KolResult[]
  onClear: () => void
  onExport: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [target, setTarget] = useState<string>('')
  const [lists, setLists] = useState<Shortlist[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  const loadLists = useCallback(async () => {
    try {
      const res = await fetch('/api/kol/shortlists')
      const json = await res.json()
      if (json.ok) setLists(json.shortlists ?? [])
      else if (json.error) setError(json.error)
    } catch {
      // Listing is a convenience; failing it must not block creating a new one.
    }
  }, [])

  useEffect(() => {
    if (open) void loadLists()
  }, [open, loadLists])

  // Escape closes the panel — a docked overlay that traps the user is worse
  // than no overlay.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const save = useCallback(async () => {
    if (!selected.length) return
    const isNew = !target
    if (isNew && !name.trim()) {
      setError('Kasih nama dulu buat shortlist-nya.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/kol/shortlists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: isNew ? name.trim() : (lists.find((l) => l.id === target)?.name ?? 'Shortlist'),
          entries: selected.map(snapshot),
          ...(isNew ? {} : { shortlist_id: target }),
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Gagal simpan.')
      setSaved(`Kesimpen — ${json.added} KOL baru, total ${json.total}.`)
      setName('')
      setOpen(false)
      // Closing the panel unmounts the button that had focus, dropping keyboard
      // users onto document.body right after a successful save.
      toggleRef.current?.focus()
      onClear()
      setTimeout(() => setSaved(null), 6000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal simpan.')
    } finally {
      setSaving(false)
    }
  }, [selected, name, target, lists, onClear])

  const remove = useCallback(
    async (id: string) => {
      await fetch(`/api/kol/shortlists?id=${id}`, { method: 'DELETE' }).catch(() => {})
      void loadLists()
      if (target === id) setTarget('')
    },
    [loadLists, target],
  )

  if (saved) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
        <p
          role="status"
          aria-live="polite"
          className="kol-dock pointer-events-auto flex items-center gap-2 rounded-full border border-emerald-500/40 bg-surface px-4 py-2 text-xs font-medium text-emerald-700 shadow-lg"
        >
          <Check size={14} aria-hidden />
          {saved}
        </p>
      </div>
    )
  }

  if (!selected.length) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div className="kol-dock pointer-events-auto w-full max-w-2xl rounded-xl border border-border bg-surface shadow-[0_8px_32px_-8px_rgba(24,24,27,0.28)]">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="text-xs font-semibold text-text">
            {selected.length} KOL dipilih
          </span>
          <span className="hidden font-data text-[11px] tabular-nums text-mutedText/60 sm:inline">
            total {compactCount(selected.reduce((a, r) => a + (r.profile.followers ?? 0), 0))} follower
          </span>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onExport}
              className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-medium text-mutedText transition-colors hover:text-text"
            >
              Ekspor CSV
            </button>
            <button
              ref={toggleRef}
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="kol-shortlist-panel"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-onPrimary transition-opacity hover:opacity-90"
            >
              <BookmarkPlus size={13} aria-hidden />
              Simpan shortlist
            </button>
            <button
              type="button"
              onClick={onClear}
              aria-label="Batal pilih semua"
              className="rounded-lg p-1.5 text-mutedText transition-colors hover:text-text"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        </div>

        {open && (
          <form
            id="kol-shortlist-panel"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
            className="border-t border-border px-4 py-3"
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-text focus:border-primary focus:outline-none sm:w-52"
              >
                <option value="">+ Shortlist baru</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({Array.isArray(l.entries) ? l.entries.length : 0})
                  </option>
                ))}
              </select>

              {!target && (
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama shortlist, misal: Campaign Ramadan — Mikro Jabodetabek"
                  className="flex-1 rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-text placeholder:text-mutedText/40 focus:border-primary focus:outline-none"
                  autoFocus
                />
              )}

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-onPrimary transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
                {target ? 'Tambahin' : 'Simpan'}
              </button>
            </div>

            <p className="mt-2 text-[10px] leading-snug text-mutedText/50">
              Angka yang kesimpen adalah kondisi <strong className="font-semibold">saat ini</strong>. Follower dan
              engagement bakal berubah, tapi catatan ini tetap, biar nanti ketahuan kamu milih dia karena apa.
            </p>

            {lists.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {lists.slice(0, 6).map((l) => (
                  <li key={l.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-mutedText">
                    {l.name}
                    <button
                      type="button"
                      onClick={() => void remove(l.id)}
                      aria-label={`Hapus shortlist ${l.name}`}
                      className="text-mutedText/40 transition-colors hover:text-destructive"
                    >
                      <Trash2 size={10} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {error && <p role="alert" className="mt-2 text-[11px] text-destructive">{error}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
