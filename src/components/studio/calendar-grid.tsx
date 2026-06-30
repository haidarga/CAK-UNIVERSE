"use client";

import { Plus, Trash2, UploadCloud, Loader2, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { requestViralCheck } from "./sge-viral-lab";

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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: weeks }, (_, i) => i + 1).map((week) => {
        const weekSlots = slots.filter((s) => s.week === week);
        const isActive = weekSlots.length > 0;
        return (
          <section
            key={week}
            className={cn(
              "glass-2 flex flex-col gap-2.5 rounded-2xl p-2.5 transition-colors",
              isActive ? "ring-1 ring-inset ring-primary/20" : "ring-1 ring-inset ring-transparent",
            )}
            aria-label={`Week ${week}`}
          >
            <div
              className={cn(
                "flex items-center justify-between rounded-xl border px-3 py-2 transition-colors",
                isActive
                  ? "border-primary/25 bg-primary/[0.06]"
                  : "border-border/50 bg-surface-2/40",
              )}
            >
              <span
                className={cn(
                  "eyebrow",
                  isActive ? "text-primary" : "text-muted",
                )}
              >
                Week {week}
              </span>
              <span
                className={cn(
                  "tnum chip",
                  isActive
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-surface/60 text-muted",
                )}
              >
                {weekSlots.length}
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              {weekSlots.map((slot) => (
                <SlotCard key={slot.id} slot={slot} onRemove={onRemove} onPush={onPush} />
              ))}

              <button
                type="button"
                onClick={() => onAdd(week)}
                className="group inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 px-3 text-sm text-muted transition-all hover:border-primary/50 hover:bg-primary/[0.04] hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                aria-label={`Add direction to week ${week}`}
              >
                <Plus
                  className="size-4 transition-transform group-hover:rotate-90"
                  aria-hidden
                  strokeWidth={1.5}
                />
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
        "group/slot animate-fade-up rounded-xl border bg-surface/70 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:shadow-[0_6px_16px_-8px_rgba(0,0,0,0.3)]",
        slot.state === "error"
          ? "border-danger/40 bg-danger/[0.03]"
          : pushed
            ? "border-success/40 bg-success/[0.03]"
            : "border-border/60 hover:border-primary/30",
      )}
    >
      <p className="truncate text-sm font-semibold text-fg">{slot.title || "Untitled"}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {slot.pillar && (
          <span className="chip border-accent/30 bg-accent/10 text-accent">{slot.pillar}</span>
        )}
        {slot.format && (
          <span className="chip border-border bg-surface-2/60 text-muted">{slot.format}</span>
        )}
      </div>
      {slot.hook && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{slot.hook}</p>}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/40 pt-2.5">
        <button
          type="button"
          onClick={() => onRemove(slot.id)}
          className="inline-flex items-center gap-1 rounded-lg p-1.5 text-muted opacity-60 transition-all hover:bg-danger/10 hover:text-danger hover:opacity-100 focus-visible:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-danger/60"
          aria-label="Remove direction"
        >
          <Trash2 className="size-4" aria-hidden strokeWidth={1.5} />
        </button>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              requestViralCheck({
                title: slot.title || "Untitled",
                hook: slot.hook,
                format: slot.format,
                theme: slot.narrative_theme,
              })
            }
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2.5 text-xs font-medium text-accent transition-all hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            title="Cek potensi viral pakai SGE Viral Lab"
          >
            <Rocket className="size-3.5" aria-hidden strokeWidth={1.5} />
            Cek viral
          </button>
          <button
          type="button"
          onClick={() => onPush(slot.id)}
          disabled={slot.state === "pushing" || pushed}
          className={cn(
            "inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-70 disabled:active:scale-100",
            pushed
              ? "border-success/40 bg-success/10 text-success"
              : "border-primary/30 bg-primary/10 text-primary hover:border-primary/50 hover:bg-primary/20",
          )}
        >
          {slot.state === "pushing" ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden strokeWidth={1.5} />
          ) : (
            <UploadCloud className="size-3.5" aria-hidden strokeWidth={1.5} />
          )}
          {pushed ? "In pipeline" : "Push to pipeline"}
          </button>
        </div>
      </div>
    </article>
  );
}
