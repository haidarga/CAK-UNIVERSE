import { cn } from "@/lib/utils";
import Avatar from "@/components/avatar";
import ProgressBar from "@/components/progress-bar";

export interface WorkloadRow {
  id: string;
  name: string;
  role: string;
  active: number;
  overdue: number;
  urgent: number;
  done: number;
}

interface WorkloadPanelProps {
  rows: WorkloadRow[];
  /** Highest active count across the team — normalizes the load bar. */
  maxActive: number;
}

// A member carrying >=70% of the busiest load AND 4+ active is "overloaded".
const OVERLOAD_FLOOR = 4;

/** Per-member workload rows with a normalized load bar and risk flags. */
export default function WorkloadPanel({ rows, maxActive }: WorkloadPanelProps) {
  return (
    <ul className="flex flex-col gap-0.5">
      {rows.map((r) => {
        const loadPct = Math.round((r.active / maxActive) * 100);
        const overloaded = r.active >= OVERLOAD_FLOOR && loadPct >= 70;
        return (
          <li
            key={r.id}
            className="group flex items-center gap-3.5 rounded-xl px-2 py-3 transition-colors first:pt-0 last:pb-0 hover:bg-white/[0.02]"
          >
            <Avatar name={r.name} size={38} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-fg">{r.name}</span>
                {overloaded && (
                  <span className="chip border-phase-warming/40 bg-phase-warming/10 text-[10px] text-phase-warming">
                    Overloaded
                  </span>
                )}
                {r.overdue > 0 && (
                  <span className="chip border-danger/40 bg-danger/10 text-[10px] text-danger">
                    {r.overdue} overdue
                  </span>
                )}
              </div>
              <span className="text-xs text-muted">{r.role}</span>
              <ProgressBar
                value={loadPct}
                height={6}
                tone={overloaded ? "warning" : "primary"}
                className="mt-2"
                label={`${r.active} active tasks`}
              />
            </div>
            <div className="flex shrink-0 gap-3 text-right">
              <Metric value={r.active} label="active" tone="text-fg" />
              <Metric value={r.urgent} label="urgent" tone={r.urgent ? "text-danger" : "text-muted"} />
              <Metric value={r.done} label="done" tone="text-phase-warm" />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Metric({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="w-10">
      <span className={cn("tnum block text-base font-semibold leading-none", tone)}>{value}</span>
      <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-wider text-muted">
        {label}
      </span>
    </div>
  );
}
