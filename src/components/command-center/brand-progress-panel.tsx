import ProgressBar from "@/components/progress-bar";

export interface BrandProgressRow {
  brand: string;
  percent: number;
  total: number;
  done: number;
}

/** Per-brand completion bars, busiest brand first. */
export default function BrandProgressPanel({ rows }: { rows: BrandProgressRow[] }) {
  return (
    <ul className="flex flex-col gap-5">
      {rows.map((r) => (
        <li key={r.brand} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-fg">{r.brand}</span>
            <span className="tnum shrink-0 text-xs text-muted">
              <span className="font-display text-base font-bold text-fg">{r.percent}%</span>{" "}
              <span className="text-muted/70">· {r.done}/{r.total}</span>
            </span>
          </div>
          <ProgressBar value={r.percent} height={8} label={`${r.brand} ${r.percent}% complete`} />
        </li>
      ))}
    </ul>
  );
}
