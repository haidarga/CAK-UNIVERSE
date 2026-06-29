"use client";

import { Plus, Trash2, UploadCloud, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CalendarSlot {
  /** Local id, not persisted until pushed. */
  id: string;
  week: number; // 1..4
  title: string;
  pillar: string;
  format: string;
  hook?: string;
  narrative_theme?: string;
  /** Push lifecycle. */
  state: "draft" | "pushing" | "pushed" | "error";
}

interface CalendarGridProps {
  slots: CalendarSlot[];
  weeks?: number;
  onAdd: (week: number) => void;
  onRemove: (id: string) => void;
  onPush: (id: string) => void;
}

/** 4-week planning board. Each week is a column the strategist fills with directions. */
export default function CalendarGrid({
  slots,
  weeks = 4,
  onAdd,
  onRemove,
  onPush,
}: CalendarGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: weeks }, (_, i) => i + 1).map((week) => {
        const weekSlots = slots.filter((s) => s.week === week);
        return (
          <section key={week} className="flex flex-col gap-2" aria-label={`Week ${week}`}>
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-2/40 px-3 py-2">
              <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted">
                Week {week}
              </span>
              <span className="tnum chip border-border bg-surface/60 text-muted">
                {weekSlots.length}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {weekSlots.map((slot) => (
                <SlotCard key={slot.id} slot={slot} onRemove={onRemove} onPush={onPush} />
              ))}

              <button
                type="button"
                onClick={() => onAdd(week)}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/70 px-3 text-sm text-muted transition-colors hover:border-primary/50 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                aria-label={`Add direction to week ${week}`}
              >
                <Plus className="size-4" aria-hidden />
                Add direction
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SlotCard({
  slot,
  onRemove,
  onPush,
}: {
  slot: CalendarSlot;
  onRemove: (id: string) => void;
  onPush: (id: string) => void;
}) {
  const pushed = slot.state === "pushed";
  return (
    <article
      className={cn(
        "animate-fade-up rounded-xl border bg-surface-2/50 p-3",
        slot.state === "error" ? "border-danger/40" : pushed ? "border-success/40" : "border-border/60",
      )}
    >
      <p className="truncate text-sm font-semibold text-fg">{slot.title || "Untitled"}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {slot.pillar && (
          <span className="chip border-accent/30 bg-accent/10 text-accent">{slot.pillar}</span>
        )}
        {slot.format && (
          <span className="chip border-border bg-surface/60 text-muted">{slot.format}</span>
        )}
      </div>
      {slot.hook && <p className="mt-2 line-clamp-2 text-xs text-muted">{slot.hook}</p>}

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onRemove(slot.id)}
          className="inline-flex items-center gap-1 rounded-lg p-1.5 text-muted transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/60"
          aria-label="Remove direction"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onPush(slot.id)}
          disabled={slot.state === "pushing" || pushed}
          className={cn(
            "inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-70",
            pushed
              ? "border-success/40 bg-success/10 text-success"
              : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
          )}
        >
          {slot.state === "pushing" ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <UploadCloud className="size-3.5" aria-hidden />
          )}
          {pushed ? "In pipeline" : "Push to pipeline"}
        </button>
      </div>
    </article>
  );
}
