import { CheckCircle2, CircleSlash, Clock, ListTodo } from "lucide-react";
import type { Rollup } from "@/lib/progress";
import { cn } from "@/lib/utils";
import ProgressBar from "@/components/progress-bar";

interface HeroTilesProps {
  roll: Rollup;
}

/** Top-line mission-control KPIs the boss reads in 5 seconds. */
export default function HeroTiles({ roll }: HeroTilesProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {/* Completion — flagship double-bezel tile with glowing accent ring */}
      <div className="bezel animate-fade-up col-span-2">
        <div className="glass glow-primary relative overflow-hidden p-6">
          {/* soft radial accent behind the number */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full opacity-60 blur-3xl"
            style={{
              background: "radial-gradient(circle, rgb(var(--primary) / 0.3), transparent 70%)",
            }}
          />
          <p className="eyebrow relative">Overall Completion</p>
          <div className="relative mt-4 flex items-end gap-3">
            <span className="tnum text-gradient font-display text-6xl font-bold leading-[0.9]">
              {roll.percent}%
            </span>
            <span className="tnum mb-1 text-sm font-medium text-muted">
              {roll.done}/{roll.total} done
            </span>
          </div>
          <ProgressBar
            value={roll.percent}
            height={12}
            className="relative mt-5"
            label="Overall completion"
          />
        </div>
      </div>

      <MetricTile
        icon={ListTodo}
        label="Active"
        value={roll.active}
        tone="text-primary"
        glow={roll.active > 0}
      />
      <MetricTile
        icon={CircleSlash}
        label="Blocked"
        value={roll.blocked}
        tone={roll.blocked > 0 ? "text-phase-flagged" : "text-muted"}
        glow={roll.blocked > 0}
      />
      <MetricTile
        icon={Clock}
        label="Overdue"
        value={roll.overdue}
        tone={roll.overdue > 0 ? "text-danger" : "text-muted"}
        glow={roll.overdue > 0}
      />
      <MetricTile
        icon={CheckCircle2}
        label="Done"
        value={roll.done}
        tone="text-phase-warm"
        glow={false}
      />
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  tone,
  glow,
}: {
  icon: React.ComponentType<{
    className?: string;
    "aria-hidden"?: boolean;
    strokeWidth?: number;
  }>;
  label: string;
  value: number;
  tone: string;
  glow: boolean;
}) {
  return (
    <div className="glass glass-hover animate-fade-up relative overflow-hidden p-5">
      {glow && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -right-6 -top-8 size-28 rounded-full opacity-50 blur-2xl",
            tone,
          )}
          style={{ background: "currentColor" }}
        />
      )}
      <div className="relative flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted">{label}</span>
        <span
          className={cn(
            "grid size-7 place-items-center rounded-full border border-white/10 bg-white/[0.04]",
            tone,
          )}
        >
          <Icon className="size-3.5" strokeWidth={1.5} aria-hidden />
        </span>
      </div>
      <span className={cn("tnum font-display relative mt-3 block text-4xl font-bold leading-none", tone)}>
        {value}
      </span>
    </div>
  );
}
