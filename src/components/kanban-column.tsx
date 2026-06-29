import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface KanbanColumnProps {
  title: string;
  count: number;
  /** Tailwind bg/text class for the status accent dot. */
  dot?: string;
  children: ReactNode;
}

/** A single board lane: sticky glass header with a count, scrollable body. */
export default function KanbanColumn({ title, count, dot, children }: KanbanColumnProps) {
  return (
    <div className="glass-2 flex w-72 shrink-0 flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
        <span className="flex min-w-0 items-center gap-2">
          {dot && (
            <span
              className={cn("size-2 shrink-0 rounded-full shadow-[0_0_8px_-1px_currentColor]", dot)}
              aria-hidden
            />
          )}
          <span className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {title}
          </span>
        </span>
        <span className="tnum chip shrink-0 border-white/10 bg-white/[0.05] px-2 text-[11px] font-semibold text-fg/80">
          {count}
        </span>
      </div>
      <div className="flex min-h-[60px] flex-col gap-3">
        {count === 0 ? (
          <p className="rounded-xl border border-dashed border-white/[0.07] px-3 py-7 text-center text-xs text-muted/70">
            Empty
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
