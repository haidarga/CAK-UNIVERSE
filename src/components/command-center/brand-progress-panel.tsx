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
    <ul className="flex flex-col gap-4">
      {rows.map((r) => (
        <li key={r.brand} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-fg">{r.brand}</span>
            <span className="tnum shrink-0 text-xs text-muted">
              <span className="font-semibold text-fg">{r.percent}%</span> · {r.done}/{r.total}
            </span>
          </div>
          <ProgressBar value={r.percent} height={7} label={`${r.brand} ${r.percent}% complete`} />
        </li>
      ))}
    </ul>
  );
}
