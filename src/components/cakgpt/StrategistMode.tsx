'use client'

import { useState } from 'react'
import {
  Radar, Search, RefreshCw, CheckCircle2, Info, Copy, Check,
  Users, Eye, Heart, MessageCircle, CalendarClock, Sparkles, ShieldCheck, TriangleAlert,
} from 'lucide-react'
import { StrategistReportSchema } from '@/lib/cakgpt/strategist/schemas'
import type { StrategistReport, RangeIDR } from '@/lib/cakgpt/strategist/types'

// ── Formatters (id-ID) ────────────────────────────────────────────────────────
const nf = new Intl.NumberFormat('id-ID')
const compact = (n: number | null) =>
  n === null ? '—' : new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
const idr = (n: number) => 'Rp ' + nf.format(Math.round(n))
const idrRange = (r: RangeIDR) => `${idr(r.low)} – ${idr(r.high)}`
const pctRange = (r: RangeIDR) => `${nf.format(r.low)}% – ${nf.format(r.high)}%`

const CONFIDENCE: Record<string, { label: string; cls: string }> = {
  high: { label: 'Confidence tinggi', cls: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' },
  medium: { label: 'Confidence sedang', cls: 'bg-amber-500/12 text-amber-600 dark:text-amber-400' },
  low: { label: 'Confidence rendah', cls: 'bg-destructive/10 text-destructive' },
}

export function StrategistMode() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<StrategistReport | null>(null)
  const [copied, setCopied] = useState(false)

  async function analyze(forceRefresh = false) {
    // Internal guard — the disabled attribute only applies after re-render, so a
    // fast Enter+click could otherwise fire two calls against a scarce quota.
    if (loading) return
    if (!url.trim()) return setError('Paste link akun TikTok atau Instagram dulu.')
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/scriptwriter/strategist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), force_refresh: forceRefresh }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Gagal menganalisis akun.')
      // Validate before rendering — keeps the green "Data Aktual" section from
      // ever showing undefined/NaN if the API/DB shape ever drifts.
      const validated = StrategistReportSchema.safeParse(data.report)
      if (!validated.success) throw new Error('Response dari server tidak valid.')
      setReport(validated.data as StrategistReport)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error')
    } finally {
      setLoading(false)
    }
  }

  async function copyInsight() {
    if (!report) return
    try {
      await navigator.clipboard.writeText(report.estimate.brief_insight)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Gagal menyalin — browser memblokir akses clipboard.')
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <label htmlFor="strategist-url" className="mb-1 block text-xs font-medium text-text">Link akun TikTok / Instagram</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-mutedText" aria-hidden />
            <input
              id="strategist-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && analyze()}
              placeholder="tiktok.com/@namaakun  ·  instagram.com/namaakun"
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <button
            onClick={() => analyze()}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-onPrimary hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            <Radar size={16} aria-hidden /> {loading ? 'Menganalisis…' : 'Analisis'}
          </button>
        </div>
        <p className="mt-2 text-xs text-mutedText">Level akun (bukan per-video). Data di-cache biar hemat kuota — pakai “Refresh” buat paksa ambil ulang.</p>
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      </div>

      {report && (
        <div className="space-y-4">
          {/* ── Account header ──────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center gap-3">
              {report.account.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={report.account.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
              ) : (
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted font-data text-sm font-semibold text-mutedText">
                  {report.account.handle.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-text">@{report.account.handle}</span>
                  {report.account.verified && <CheckCircle2 size={14} className="text-primary" aria-label="verified" />}
                </div>
                <span className="font-data text-[11px] uppercase tracking-wide text-mutedText">
                  {report.account.platform} · {compact(report.account.followers)} followers
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {report.meta.cached && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-mutedText">dari cache</span>
              )}
              <button
                onClick={() => analyze(true)}
                disabled={loading}
                className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-mutedText hover:bg-muted hover:text-text disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw size={13} aria-hidden /> Refresh
              </button>
            </div>
          </div>

          {/* ── Data Aktual (GREEN — measured) ──────────────────────────── */}
          <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] p-4">
            <SectionHeader
              tone="green"
              icon={<ShieldCheck size={14} aria-hidden />}
              title="Data Aktual"
              subtitle="Diukur langsung dari post publik"
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat icon={<Users size={14} />} label="Followers" value={nf.format(report.metrics.followers)} />
              <Stat icon={<Eye size={14} />} label="Avg views" value={report.metrics.avgViews === null ? 'N/A' : nf.format(report.metrics.avgViews)} />
              <Stat
                icon={<Heart size={14} />}
                label="Engagement"
                value={`${nf.format(report.metrics.engagementRatePct)}%`}
                hint={`Basis: ${report.metrics.engagementBasis === 'views' ? 'views' : 'followers'} · ${report.metrics.postsAnalyzed} post`}
              />
              <Stat
                icon={<CalendarClock size={14} />}
                label="Cadence"
                value={report.metrics.postsPerWeek === null ? 'N/A' : `${nf.format(report.metrics.postsPerWeek)}/mgg`}
              />
              <Stat icon={<Heart size={14} />} label="Avg likes" value={report.metrics.avgLikes === null ? 'N/A' : nf.format(report.metrics.avgLikes)} />
              <Stat icon={<MessageCircle size={14} />} label="Avg comments" value={report.metrics.avgComments === null ? 'N/A' : nf.format(report.metrics.avgComments)} />
              {report.metrics.avgShares !== null && (
                <Stat icon={<Sparkles size={14} />} label="Avg shares" value={nf.format(report.metrics.avgShares)} />
              )}
            </div>
          </section>

          {/* ── Estimasi Strategis (YELLOW — inferred) ──────────────────── */}
          <section className="rounded-lg border border-amber-500/30 bg-amber-500/[0.05] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <SectionHeader
                tone="yellow"
                icon={<TriangleAlert size={14} aria-hidden />}
                title="Estimasi Strategis"
                subtitle="Ditaksir AI — bukan data terukur"
              />
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CONFIDENCE[report.estimate.confidence]?.cls || ''}`}>
                {CONFIDENCE[report.estimate.confidence]?.label || report.estimate.confidence}
              </span>
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5">
              <Tag>niche: {report.estimate.niche}</Tag>
              <Tag>{report.estimate.region}</Tag>
              <Tag>tier: {report.estimate.audience_tier}</Tag>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <EstRow label="Est. rate / post" value={idrRange(report.estimate.est_rate_per_post_idr)} reason={report.estimate.reasoning.rate} highlight />
              <EstRow label="Est. CPM" value={idrRange(report.estimate.est_cpm_idr)} reason={report.estimate.reasoning.cpm} />
              <EstRow label="Est. CPC" value={idrRange(report.estimate.est_cpc_idr)} reason={report.estimate.reasoning.cpc} />
              <EstRow label="Est. CTR" value={pctRange(report.estimate.est_ctr_pct)} reason={report.estimate.reasoning.ctr} />
            </div>
          </section>

          {/* ── Insight buat Brief ──────────────────────────────────────── */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles size={14} className="text-primary" aria-hidden />
                <h3 className="text-sm font-semibold text-text">Insight buat Brief</h3>
              </div>
              <button
                onClick={copyInsight}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-mutedText hover:bg-muted hover:text-text cursor-pointer"
              >
                {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />} {copied ? 'Tersalin' : 'Salin'}
              </button>
            </div>
            <p className="text-sm leading-relaxed text-text">{report.estimate.brief_insight}</p>
          </section>

          <p className="text-center text-[11px] text-mutedText">
            Angka “Estimasi” ditaksir AI dari data real + benchmark pasar Indonesia. Pakai sebagai panduan, bukan angka final.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Small presentational pieces ───────────────────────────────────────────────
function SectionHeader({ tone, icon, title, subtitle }: { tone: 'green' | 'yellow'; icon: React.ReactNode; title: string; subtitle: string }) {
  const cls = tone === 'green' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className={`flex items-center gap-1.5 rounded-full bg-background/60 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${cls}`}>
        {icon} {title}
      </span>
      <span className="text-xs text-mutedText">{subtitle}</span>
    </div>
  )
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-background/50 p-2.5">
      <div className="mb-0.5 flex items-center gap-1 text-mutedText">
        <span className="text-emerald-600 dark:text-emerald-400">{icon}</span>
        <span className="text-[11px]">{label}</span>
      </div>
      <div className="font-data text-base font-semibold text-text">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-mutedText">{hint}</div>}
    </div>
  )
}

function EstRow({ label, value, reason, highlight }: { label: string; value: string; reason: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border border-border p-2.5 ${highlight ? 'bg-amber-500/[0.06]' : 'bg-background/50'}`}>
      <div className="flex items-center gap-1 text-[11px] text-mutedText">
        {label}
        <span title={reason} className="cursor-help text-mutedText/70" aria-label={reason}>
          <Info size={12} />
        </span>
      </div>
      <div className="mt-0.5 font-data text-sm font-semibold text-text">{value}</div>
      <div className="mt-1 text-[11px] leading-snug text-mutedText">{reason}</div>
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-mutedText">{children}</span>
}
