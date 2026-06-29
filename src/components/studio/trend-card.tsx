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
    <article className="glass glass-hover flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="chip border-border bg-surface-2/60 text-muted">
          <Flame className="size-3 text-accent" aria-hidden />
          {trend.platform}
        </span>
        {trend.content_url && (
          <a
            href={trend.content_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg p-1 text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            aria-label="Open trend source"
          >
            <ExternalLink className="size-4" aria-hidden />
          </a>
        )}
      </div>

      {trend.emotional_angle && (
        <p className="text-sm font-medium text-fg">{trend.emotional_angle}</p>
      )}
      {trend.hook_pattern && (
        <p className="rounded-lg border border-border/60 bg-surface-2/40 px-2.5 py-1.5 text-xs text-muted">
          {trend.hook_pattern}
        </p>
      )}

      <dl className="grid grid-cols-3 gap-2 text-center">
        <Metric label="Views" value={fmtCompact(trend.views)} />
        <Metric label="Shares" value={fmtCompact(trend.shares)} />
        <Metric label="Eng" value={fmtPct(trend.engagement_rate)} />
      </dl>

      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted">
          <span className="flex items-center gap-1">
            <TrendingUp className="size-3" aria-hidden /> Relevance
          </span>
          <span className="tnum">{relevancePct}%</span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2/80"
          role="progressbar"
          aria-valuenow={relevancePct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Relevance score"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-300"
            style={{ width: `${relevancePct}%` }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => onUse(trend)}
        className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <Plus className="size-4" aria-hidden />
        Use as direction
      </button>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface-2/40 px-1.5 py-2">
      <dd className="tnum text-sm font-semibold text-fg">{value}</dd>
      <dt className="text-[10px] uppercase tracking-widest text-muted">{label}</dt>
    </div>
  );
}
