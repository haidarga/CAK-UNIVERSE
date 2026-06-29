"use client";

import { TrendingUp, Flame, ExternalLink, Plus } from "lucide-react";
import type { Trend } from "@/lib/types";
import { fmtCompact, fmtPct } from "@/lib/utils";

interface TrendCardProps {
  trend: Trend;
  /** Turn this trend into a calendar suggestion. */
  onUse: (trend: Trend) => void;
}

/** Single trend tile: metrics, emotional angle, hook pattern, relevance bar. */
export default function TrendCard({ trend, onUse }: TrendCardProps) {
  const relevance = Math.max(0, Math.min(1, trend.relevance_score ?? 0));
  const relevancePct = Math.round(relevance * 100);

  return (
    <article className="group glass glass-hover flex flex-col gap-3.5 p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="chip border-accent/25 bg-accent/10 text-accent">
          <Flame className="size-3" aria-hidden strokeWidth={1.5} />
          {trend.platform}
        </span>
        {trend.content_url && (
          <a
            href={trend.content_url}
            target="_blank"
            rel="noreferrer"
            className="btn-icon text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            aria-label="Open trend source"
          >
            <ExternalLink className="size-4" aria-hidden strokeWidth={1.5} />
          </a>
        )}
      </div>

      {trend.emotional_angle && (
        <p className="font-display text-[0.95rem] font-semibold leading-snug text-fg">
          {trend.emotional_angle}
        </p>
      )}
      {trend.hook_pattern && (
        <p className="rounded-xl border border-border/50 bg-surface-2/40 px-3 py-2 text-xs leading-relaxed text-muted">
          {trend.hook_pattern}
        </p>
      )}

      <dl className="grid grid-cols-3 gap-2 text-center">
        <Metric label="Views" value={fmtCompact(trend.views)} />
        <Metric label="Shares" value={fmtCompact(trend.shares)} />
        <Metric label="Eng" value={fmtPct(trend.engagement_rate)} />
      </dl>

      <div>
        <div className="eyebrow mb-1.5 flex items-center justify-between text-muted">
          <span className="flex items-center gap-1.5">
            <TrendingUp className="size-3" aria-hidden strokeWidth={1.5} /> Relevance
          </span>
          <span className="tnum text-fg/80">{relevancePct}%</span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-surface-2/80 ring-1 ring-inset ring-border/40"
          role="progressbar"
          aria-valuenow={relevancePct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Relevance score"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-accent shadow-[0_0_8px_-1px_var(--color-primary)] transition-[width] duration-500 ease-out"
            style={{ width: `${relevancePct}%` }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => onUse(trend)}
        className="mt-0.5 inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-primary transition-all hover:border-primary/50 hover:bg-primary/20 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <Plus className="size-4 transition-transform group-hover:rotate-90" aria-hidden strokeWidth={1.5} />
        Use as direction
      </button>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-surface-2/40 px-1.5 py-2.5 transition-colors group-hover:border-border/70">
      <dd className="tnum font-display text-base font-semibold text-fg">{value}</dd>
      <dt className="eyebrow mt-0.5 text-muted">{label}</dt>
    </div>
  );
}
