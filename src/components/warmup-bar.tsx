import type { Account } from "@/lib/types";
import { WARMUP_PHASES, PHASE_BADGE } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Segmented bar showing the distribution of accounts across warmup phases. */
export default function WarmupBar({ accounts }: { accounts: Account[] }) {
  const total = accounts.length || 1;
  const segments = WARMUP_PHASES.map((phase) => ({
    phase,
    count: accounts.filter((a) => a.warmup_phase === phase).length,
  }));
  const visible = segments.filter((s) => s.count > 0);

  return (
    <div>
      <div className="flex h-3.5 w-full gap-1 overflow-hidden rounded-full bg-black/30 p-0.5 shadow-[inset_0_1px_2px_0_rgba(0,0,0,0.6)]">
        {visible.length === 0 ? (
          <div className="h-full w-full rounded-full bg-surface-2/50" />
        ) : (
          visible.map(({ phase, count }) => (
            <div
              key={phase}
              className={cn(
                "h-full rounded-full shadow-[0_0_12px_-2px_currentColor] transition-[width] duration-500",
                PHASE_BADGE[phase]?.dot,
                PHASE_BADGE[phase]?.text,
              )}
              style={{ width: `${(count / total) * 100}%` }}
              title={`${PHASE_BADGE[phase]?.label}: ${count}`}
            />
          ))
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {segments.map(({ phase, count }) => (
          <span
            key={phase}
            className="flex items-center gap-1.5 text-xs font-medium text-muted"
          >
            <span
              className={cn(
                "size-2 rounded-full shadow-[0_0_8px_0_currentColor]",
                PHASE_BADGE[phase]?.dot,
                PHASE_BADGE[phase]?.text,
              )}
              aria-hidden
            />
            {PHASE_BADGE[phase]?.label}
            <span className="tnum font-mono font-semibold text-fg">{count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
