import { cn } from "@/lib/utils";

interface ScoreRingProps {
  /** 0-100 score. */
  score: number;
  size?: number;
}

/** SVG donut showing a 0-100 QC score, colored by threshold. */
export default function ScoreRing({ score, size = 64 }: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  const tone =
    clamped >= 80
      ? "text-success"
      : clamped >= 60
        ? "text-warning"
        : "text-danger";

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`QC score ${clamped} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-white/[0.06]"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={cn(
            "transition-[stroke-dashoffset] duration-700 [filter:drop-shadow(0_0_4px_currentColor)]",
            tone,
          )}
          stroke="currentColor"
          style={{ transitionTimingFunction: "var(--ease-spring)" }}
        />
      </svg>
      <span
        className={cn(
          "tnum absolute inset-0 grid place-items-center font-display text-sm font-bold",
          tone,
        )}
      >
        {clamped}
      </span>
    </div>
  );
}
