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
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Optional secondary line under the value. */
  sub?: string;
}

/** Big tabular-number readout with an optional colored delta. */
export default function Stat({ label, value, delta, deltaLabel, icon: Icon, sub }: StatProps) {
  const hasDelta = typeof delta === "number" && delta !== 0;
  const up = (delta ?? 0) > 0;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted">
        {Icon && <Icon className="size-3.5" aria-hidden />}
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="tnum text-3xl font-semibold leading-none text-fg">{value}</span>
        {hasDelta && (
          <span
            className={cn(
              "tnum inline-flex items-center gap-0.5 text-xs font-medium",
              up ? "text-success" : "text-danger",
            )}
          >
            {up ? (
              <ArrowUpRight className="size-3.5" aria-hidden />
            ) : (
              <ArrowDownRight className="size-3.5" aria-hidden />
            )}
            {deltaLabel ?? `${up ? "+" : ""}${delta}`}
          </span>
        )}
      </div>
      {sub && <span className="truncate text-xs text-muted">{sub}</span>}
    </div>
  );
}
