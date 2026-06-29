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
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2/50">
        {visible.length === 0 ? (
          <div className="h-full w-full bg-surface-2/50" />
        ) : (
          visible.map(({ phase, count }) => (
            <div
              key={phase}
              className={cn("h-full", PHASE_BADGE[phase]?.dot)}
              style={{ width: `${(count / total) * 100}%` }}
              title={`${PHASE_BADGE[phase]?.label}: ${count}`}
            />
          ))
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map(({ phase, count }) => (
          <span key={phase} className="flex items-center gap-1.5 text-xs text-muted">
            <span className={cn("size-2 rounded-full", PHASE_BADGE[phase]?.dot)} aria-hidden />
            {PHASE_BADGE[phase]?.label}
            <span className="tnum font-mono text-fg">{count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
