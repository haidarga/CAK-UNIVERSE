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
    <div className="flex w-72 shrink-0 flex-col">
      <div className="glass mb-3 flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5">
        <span className="flex min-w-0 items-center gap-2">
          {dot && <span className={cn("size-2 shrink-0 rounded-full", dot)} aria-hidden />}
          <span className="truncate font-mono text-[11px] font-medium uppercase tracking-widest text-muted">
            {title}
          </span>
        </span>
        <span className="tnum chip shrink-0 border-border bg-surface-2/60 text-muted">{count}</span>
      </div>
      <div className="flex min-h-[60px] flex-col gap-3">
        {count === 0 ? (
          <p className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted">
            Empty
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
