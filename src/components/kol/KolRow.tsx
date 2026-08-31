'use client'

import { memo } from 'react'
import { BadgeCheck, ExternalLink, Instagram } from 'lucide-react'
import type { KolResult } from '@/lib/kol/types'
import { tierEngagementFloor, tierLabel } from '@/lib/kol/tiers'
import { engagementIsMeaningful } from '@/lib/kol/score'
import { regionLabel } from '@/lib/kol/regions'
import { compactCount, fullCount, percent, sinceDays, cadence, engagementFill, countryName, EMPTY } from '@/lib/kol/format'

// One creator, one row.
//
// Rows rather than cards because the actual task is comparison — the eye runs
// down a column of follower counts and stops on the outliers. A card grid forces
// that same comparison into a zig-zag and is why most KOL tools are exhausting
// to read.
//
// Hierarchy is carried by scale, not by boxes: the follower count is set large
// in tabular mono and everything else steps down from it. The score never
// appears as a number — it drives the height of the stripe on the left edge, so
// rank is felt while scrolling instead of read.

// Tiers get distinct hues rather than five shades of grey, so the eye can sort
// a long list by size without reading a single number. Weights are picked for
// the studio's white field — the 300-level shades used on dark UI wash out here.
const TIER_STYLES: Record<string, string> = {
  nano: 'border-zinc-300 bg-zinc-50 text-zinc-600',
  mikro: 'border-primary/35 bg-primary/[0.06] text-primary',
  middle: 'border-teal-500/35 bg-teal-500/[0.07] text-teal-700',
  makro: 'border-accent/40 bg-accent/[0.08] text-accent',
  mega: 'border-fuchsia-500/35 bg-fuchsia-500/[0.07] text-fuchsia-700',
}

// Confidence is carried by colour weight, not by a label taking up a whole line:
// a certain location reads as normal text, an uncertain one visibly recedes.
const CONFIDENCE_TONE: Record<string, string> = {
  tinggi: 'text-mutedText',
  sedang: 'text-mutedText/70',
  rendah: 'text-mutedText/45',
}

function scoreTone(score: number): string {
  if (score >= 75) return 'bg-emerald-500'
  if (score >= 55) return 'bg-primary'
  if (score >= 35) return 'bg-accent'
  return 'bg-destructive/70'
}

export const KolRow = memo(function KolRow({
  result,
  index,
  selected,
  onToggle,
}: {
  result: KolResult
  index: number
  selected: boolean
  onToggle: (handle: string) => void
}) {
  const { profile, performance, niche, tier, region, flags } = result
  // Why this row is in the near-miss section. Shown on the row itself so it
  // travels with the creator rather than living only in a section heading the
  // reader has already scrolled past.
  const missLabel =
    result.missed === 'region'
      ? 'Beda region'
      : result.missed === 'region-unknown'
        ? 'Lokasi gak ketahuan'
      : result.missed === 'activity'
        ? 'Udah lama gak posting'
        : result.tierMatch === false
          ? 'Beda tier'
          : null
  const floor = tierEngagementFloor(tier)
  const er = performance?.engagementRate ?? null
  // Same guard the scorer uses: a ratio off a handful of views is arithmetic,
  // not a signal, and must not render as a green number.
  const trustworthy = engagementIsMeaningful(performance)
  const fill = trustworthy ? engagementFill(er, floor) : 0
  const strong = trustworthy && er !== null && er >= floor

  return (
    <li
      className="kol-row group relative"
      // Staggered entrance, capped so row 40 does not wait two seconds. Pure
      // transform+opacity, so it stays on the compositor.
      style={{ animationDelay: `${Math.min(index, 14) * 28}ms` }}
    >
      <div
        className={`relative grid grid-cols-[3px_auto_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border py-3 pl-0 pr-3 transition-[background-color,border-color,transform] duration-200 sm:grid-cols-[3px_auto_minmax(0,1fr)_auto_auto_auto] sm:gap-x-4 ${
          selected
            ? 'border-primary/60 bg-primary/[0.05] shadow-[0_2px_12px_-4px_rgba(37,99,235,0.25)]'
            : result.missed || result.tierMatch === false
              ? 'border-dashed border-border bg-surface/60 hover:border-warning/50'
              : 'border-border bg-surface hover:border-primary/40 hover:shadow-[0_2px_12px_-4px_rgba(24,24,27,0.14)]'
        }`}
      >
        {/* Score as a physical stripe. Ranking you can feel at a glance without
            a column of opaque 0-100 numbers nobody can audit. */}
        <span
          className={`my-1 ml-0 w-[3px] rounded-full ${scoreTone(result.score)}`}
          style={{ opacity: 0.35 + (result.score / 100) * 0.65 }}
          aria-hidden
        />

        <label className="flex cursor-pointer items-start gap-2.5 pl-1 pt-0.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(profile.handle)}
            className="mt-[3px] h-3.5 w-3.5 cursor-pointer accent-primary"
            aria-label={`Pilih @${profile.handle}`}
          />
          <span className="w-6 select-none pt-px text-right font-data text-[11px] tabular-nums text-mutedText/50">
            {index + 1}
          </span>
        </label>

        {/* Identity. min-w-0 is load-bearing: without it a long bio blows the
            grid track out and the whole row scrolls sideways. */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {missLabel && (
              <span className="shrink-0 rounded bg-warning/15 px-1.5 py-px text-[10px] font-medium text-warning">
                {missLabel}
              </span>
            )}
            <a
              href={profile.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group/link inline-flex min-w-0 items-center gap-1 text-sm font-semibold text-text decoration-primary/50 underline-offset-4 hover:underline"
            >
              <span className="truncate">@{profile.handle}</span>
              <ExternalLink size={11} className="shrink-0 opacity-0 transition-opacity group-hover/link:opacity-60" aria-hidden />
            </a>
            {profile.verified && <BadgeCheck size={13} className="shrink-0 text-primary" aria-label="terverifikasi" />}
            {profile.instagramHandle && result.platform !== 'instagram' && (
              <a
                href={`https://instagram.com/${profile.instagramHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-mutedText transition-colors hover:text-accent"
                title={`Instagram: @${profile.instagramHandle}`}
              >
                <Instagram size={10} aria-hidden />
                <span className="max-w-[9rem] truncate">{profile.instagramHandle}</span>
              </a>
            )}
          </div>

          {profile.displayName && profile.displayName !== profile.handle && (
            <p className="truncate text-[11px] text-mutedText/80">{profile.displayName}</p>
          )}
          {profile.bio && <p className="mt-0.5 line-clamp-1 text-[11px] text-mutedText/60">{profile.bio}</p>}

          {flags.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {flags.map((flag) => (
                <li
                  key={flag.code + flag.message}
                  className={`rounded px-1.5 py-0.5 text-[10px] leading-snug ${
                    flag.kind === 'good'
                      ? 'bg-emerald-500/10 text-emerald-600/90'
                      : 'bg-warning/10 text-warning/90'
                  }`}
                >
                  {flag.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Reach — the hero number. Everything else is sized relative to this. */}
        <div className="col-start-3 sm:col-start-4 sm:text-right">
          <p className="font-data text-lg font-semibold leading-none tabular-nums text-text" title={`${fullCount(profile.followers)} follower`}>
            {compactCount(profile.followers)}
          </p>
          <div className="mt-1 flex items-center gap-1.5 sm:justify-end">
            <span className={`rounded border px-1.5 py-px text-[10px] font-medium ${TIER_STYLES[tier ?? ''] ?? 'border-border text-mutedText'}`}>
              {tierLabel(tier)}
            </span>
            {profile.country && profile.country !== 'ID' && (
              <span className="rounded bg-destructive/10 px-1.5 py-px text-[10px] text-destructive/90" title="Bukan akun Indonesia">
                {countryName(profile.country)}
              </span>
            )}
          </div>
        </div>

        {/* Engagement, drawn against what is normal for this tier. A bare "3,2%"
            is uninterpretable; the bar says whether that is good. */}
        <div className="col-start-3 sm:col-start-5 sm:w-24">
          <div className="flex items-baseline justify-between gap-2 sm:justify-end">
            <span className="text-[10px] uppercase tracking-wide text-mutedText/50 sm:hidden">Engagement</span>
            <span
              className={`font-data text-xs font-semibold tabular-nums ${
                strong ? 'text-emerald-600' : er === null || !trustworthy ? 'text-mutedText/50' : 'text-text/80'
              }`}
              title={!trustworthy && er !== null ? 'Sampel view-nya terlalu kecil buat dipercaya' : undefined}
            >
              {percent(er)}
              {er !== null && !trustworthy && <span className="text-mutedText/40"> ?</span>}
            </span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-200" role="presentation">
            <span
              className={`kol-bar block h-full rounded-full ${strong ? 'bg-emerald-500' : 'bg-primary/70'}`}
              style={{ width: `${fill * 100}%` }}
            />
          </div>
          <p className="mt-0.5 text-[9px] text-mutedText/40 sm:text-right">
            {er === null ? 'gak keukur' : !trustworthy ? 'view kekecilan' : `normal ${floor}%`}
          </p>
        </div>

        {/* Activity + niche consistency. Recency sits highest because a dormant
            account is the single most expensive false positive here. */}
        <div className="col-start-3 sm:col-start-6 sm:w-28 sm:text-right">
          <p className="font-data text-xs tabular-nums text-text/75">{sinceDays(performance?.daysSinceLastPost)}</p>
          <p className="text-[10px] text-mutedText/50">{cadence(performance?.postingCadenceDays)}</p>
          <p className="mt-0.5 text-[10px] text-mutedText/70" title={niche?.reason ?? undefined}>
            {niche ? (
              <>
                <span className="font-data tabular-nums">{niche.matched}/{niche.total}</span>
                {/* Niche is an LLM judgement, exactly as estimated as location —
                    it gets the same tilde so neither reads as a measurement. */}
                <span className="text-mutedText/45"> nyambung~</span>
              </>
            ) : (
              <span className="text-mutedText/35">niche {EMPTY}</span>
            )}
          </p>
          {/* Location always shows HOW it was worked out. A confident read from a
              geotag and a shaky read from one caption must never look alike. */}
          <p className="text-[10px]">
            {region.area ? (
              <span
                className={CONFIDENCE_TONE[region.confidence ?? 'rendah']}
                title={region.evidence ? `Dari: ${region.evidence} · ${Math.round(region.dominance * 100)}% sinyal` : undefined}
              >
                {regionLabel(region.area)}
                {region.confidence !== 'tinggi' && <span className="text-mutedText/40"> ?</span>}
              </span>
            ) : (
              <span className="text-mutedText/30" title={region.evidence ?? undefined}>
                lokasi {EMPTY}
              </span>
            )}
          </p>
        </div>
      </div>
    </li>
  )
})
