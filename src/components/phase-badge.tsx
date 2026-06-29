import { PHASE_BADGE } from "@/lib/constants";
import { cn } from "@/lib/utils";

const PULSING = new Set(["active", "flagged"]);

/** Pill badge for a warmup phase (or status). Active/flagged dots pulse. */
export default function PhaseBadge({ phase }: { phase: string }) {
  const badge = PHASE_BADGE[phase] ?? PHASE_BADGE.cold;
  const pulse = PULSING.has(phase);
  return (
    <span className={cn("chip bg-surface-2/60", badge.ring, badge.text)}>
      <span
        className={cn("size-1.5 rounded-full", badge.dot, pulse && "animate-pulse-dot")}
        aria-hidden
      />
      {badge.label}
    </span>
  );
}
