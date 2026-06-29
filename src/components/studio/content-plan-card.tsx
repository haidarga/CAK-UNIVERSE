"use client";

import { PenLine, Sparkles } from "lucide-react";
import type { ContentPipeline } from "@/lib/types";

interface ContentPlanCardProps {
  item: ContentPipeline;
  /** True while this card's direction is loaded in the editor. */
  active?: boolean;
  onWrite: (item: ContentPipeline) => void;
}

/** A strategist's planned direction waiting to be written into a script. */
export default function ContentPlanCard({ item, active, onWrite }: ContentPlanCardProps) {
  const dir = item.content_direction;
  const title = dir?.title ?? "Untitled direction";
  const format = item.content_format ?? dir?.format ?? null;
  const pillar = item.emotional_pillar ?? dir?.emotional_pillar ?? null;
  const hook = dir?.hook ?? null;
  const theme = dir?.narrative_theme ?? null;
  const notes = dir?.research_notes ?? null;

  const meta = [format && `format: ${format}`, pillar && `pillar: ${pillar}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={`glass glass-hover flex flex-col gap-3 p-4 ${active ? "ring-1 ring-primary/50" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-sm font-semibold text-fg">{title}</h3>
        <span className="shrink-0 rounded-full border border-border bg-surface-2/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted">
          {item.stage === "direction_set" ? "planned" : "briefed"}
        </span>
      </div>

      {meta && <p className="font-mono text-[11px] text-muted">{meta}</p>}

      {hook && (
        <p className="flex items-start gap-1.5 text-xs text-fg/80">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="line-clamp-2">{hook}</span>
        </p>
      )}

      {theme && <p className="line-clamp-2 text-xs text-muted">{theme}</p>}
      {notes && <p className="line-clamp-3 text-xs text-muted/80">{notes}</p>}

      <div className="mt-1 flex justify-end">
        <button
          type="button"
          onClick={() => onWrite(item)}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-primary/40 bg-primary/15 px-3.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <PenLine className="size-4" aria-hidden />
          Tulis naskah
        </button>
      </div>
    </article>
  );
}
