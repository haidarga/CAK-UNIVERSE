import type { ComponentType } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatProps {
  label: string;
  value: string | number;
  /** Signed delta; positive renders success/up, negative renders danger/down. */
  delta?: number;
  /** Formatted delta label (e.g. "+12.4%"); falls back to the numeric delta. */
  deltaLabel?: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean; strokeWidth?: number }>;
  /** Optional secondary line under the value. */
  sub?: string;
  /** Accent tone for the value (e.g. "text-danger"). */
  tone?: string;
}

/** Big tabular-number readout with an optional colored delta. */
export default function Stat({ label, value, delta, deltaLabel, icon: Icon, sub, tone }: StatProps) {
  const hasDelta = typeof delta === "number" && delta !== 0;
  const up = (delta ?? 0) > 0;
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        {Icon && <Icon className="size-3.5" aria-hidden strokeWidth={1.5} />}
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span className={cn("tnum font-display text-4xl font-bold leading-none", tone ?? "text-fg")}>
          {value}
        </span>
        {hasDelta && (
          <span
            className={cn(
              "tnum inline-flex items-center gap-0.5 text-xs font-semibold",
              up ? "text-success" : "text-danger",
            )}
          >
            {up ? (
              <ArrowUpRight className="size-3.5" aria-hidden strokeWidth={2} />
            ) : (
              <ArrowDownRight className="size-3.5" aria-hidden strokeWidth={2} />
            )}
            {deltaLabel ?? `${up ? "+" : ""}${delta}`}
          </span>
        )}
      </div>
      {sub && <span className="truncate text-xs text-muted">{sub}</span>}
    </div>
  );
}
