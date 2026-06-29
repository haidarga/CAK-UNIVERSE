import { Layers } from "lucide-react";
import type { ContentPipeline } from "@/lib/types";

/** A single pipeline item card inside a kanban column. */
export default function PipelineCard({ item, brandName }: { item: ContentPipeline; brandName?: string }) {
  const title = item.content_direction?.title ?? "Untitled brief";
  const pillar = item.emotional_pillar ?? item.content_direction?.emotional_pillar;
  const format = item.content_format ?? item.content_direction?.format;

  return (
    <article className="glass glass-hover flex flex-col gap-2.5 p-3.5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-muted">
          <Layers className="size-3.5" aria-hidden strokeWidth={1.5} />
        </span>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-fg">{title}</h3>
      </div>
      {brandName && (
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{brandName}</span>
      )}
      <div className="flex flex-wrap gap-1.5">
        {pillar && (
          <span className="chip border-accent/30 bg-accent/10 text-accent shadow-[0_0_18px_-8px_rgba(244,162,56,0.7)]">
            {pillar}
          </span>
        )}
        {format && (
          <span className="chip border-white/10 bg-white/[0.04] text-muted">{format}</span>
        )}
      </div>
    </article>
  );
}
