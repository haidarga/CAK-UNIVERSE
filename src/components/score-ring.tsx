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
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-2"
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
          className={cn("transition-[stroke-dashoffset] duration-500", tone)}
          stroke="currentColor"
        />
      </svg>
      <span
        className={cn(
          "tnum absolute inset-0 grid place-items-center text-sm font-semibold",
          tone,
        )}
      >
        {clamped}
      </span>
    </div>
  );
}
