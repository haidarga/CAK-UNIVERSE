import { CheckCircle2, CircleSlash, Clock, ListTodo } from "lucide-react";
import type { Rollup } from "@/lib/progress";
import { cn } from "@/lib/utils";
import GlassCard from "@/components/glass-card";
import ProgressBar from "@/components/progress-bar";

interface HeroTilesProps {
  roll: Rollup;
}

/** Top-line mission-control KPIs the boss reads in 5 seconds. */
export default function HeroTiles({ roll }: HeroTilesProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {/* Completion — wide emphasis tile */}
      <GlassCard className="col-span-2" noHover>
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Overall Completion
        </p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="tnum text-5xl font-semibold leading-none text-fg">{roll.percent}%</span>
          <span className="tnum text-sm text-muted">
            {roll.done}/{roll.total} done
          </span>
        </div>
        <ProgressBar value={roll.percent} height={10} className="mt-4" label="Overall completion" />
      </GlassCard>

      <MetricTile
        icon={ListTodo}
        label="Active"
        value={roll.active}
        tone="text-primary"
        ring="border-primary/30"
      />
      <MetricTile
        icon={CircleSlash}
        label="Blocked"
        value={roll.blocked}
        tone={roll.blocked > 0 ? "text-phase-flagged" : "text-muted"}
        ring={roll.blocked > 0 ? "border-phase-flagged/40" : "border-border"}
      />
      <MetricTile
        icon={Clock}
        label="Overdue"
        value={roll.overdue}
        tone={roll.overdue > 0 ? "text-danger" : "text-muted"}
        ring={roll.overdue > 0 ? "border-danger/40" : "border-border"}
      />
      <MetricTile
        icon={CheckCircle2}
        label="Done"
        value={roll.done}
        tone="text-phase-warm"
        ring="border-phase-warm/30"
      />
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  tone,
  ring,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: number;
  tone: string;
  ring: string;
}) {
  return (
    <GlassCard noHover className={cn("border", ring)}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted">{label}</span>
        <Icon className={cn("size-4", tone)} aria-hidden />
      </div>
      <span className={cn("tnum mt-2 block text-4xl font-semibold leading-none", tone)}>
        {value}
      </span>
    </GlassCard>
  );
}
