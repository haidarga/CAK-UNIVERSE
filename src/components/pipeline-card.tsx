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
        <Layers className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-fg">{title}</h3>
      </div>
      {brandName && (
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{brandName}</span>
      )}
      <div className="flex flex-wrap gap-1.5">
        {pillar && (
          <span className="chip border-accent/30 bg-accent/10 text-accent">{pillar}</span>
        )}
        {format && (
          <span className="chip border-border bg-surface-2/60 text-muted">{format}</span>
        )}
      </div>
    </article>
  );
}
