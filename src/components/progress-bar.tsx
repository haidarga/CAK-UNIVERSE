import { cn } from "@/lib/utils";

interface ProgressBarProps {
  /** 0..100 */
  value: number;
  /** Track height in px. */
  height?: number;
  /** Force a fill tone instead of the percent-derived color. */
  tone?: "primary" | "warm" | "warning" | "danger";
  className?: string;
  /** Accessible label for the bar. */
  label?: string;
}

function toneByPercent(pct: number): string {
  if (pct >= 80) return "bg-phase-warm";
  if (pct >= 40) return "bg-primary";
  if (pct >= 15) return "bg-phase-warming";
  return "bg-danger";
}

const TONE_MAP: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  primary: "bg-primary",
  warm: "bg-phase-warm",
  warning: "bg-phase-warming",
  danger: "bg-danger",
};

/** Slim animated progress track; fill color derives from percent unless overridden. */
export default function ProgressBar({
  value,
  height = 6,
  tone,
  className,
  label,
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(Number.isNaN(value) ? 0 : value)));
  const fill = tone ? TONE_MAP[tone] : toneByPercent(pct);

  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={{ height }}
      className={cn(
        "w-full overflow-hidden rounded-full border border-white/[0.04] bg-black/30 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]",
        className,
      )}
    >
      <div
        style={{ width: `${pct}%`, transitionTimingFunction: "var(--ease-spring)" }}
        className={cn(
          "h-full rounded-full shadow-[0_0_10px_-1px_rgba(255,255,255,0.25)] transition-[width] duration-700",
          fill,
        )}
      />
    </div>
  );
}
