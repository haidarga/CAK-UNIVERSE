"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCompact } from "@/lib/utils";

export interface ViewsPoint {
  date: string;
  views: number;
}

const AXIS = "rgb(138 150 176)";
const GRID = "rgb(52 64 92 / 0.4)";
const PRIMARY = "rgb(59 130 246)";

/** Views-over-time area chart. Client-only (recharts). */
export default function ViewsChart({ data }: { data: ViewsPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="grid h-64 place-items-center text-sm text-muted">
        No KPI data for this period.
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.35} />
              <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: AXIS, fontSize: 11 }}
            tickFormatter={(d: string) => d.slice(5)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: AXIS, fontSize: 11 }}
            tickFormatter={(v: number) => fmtCompact(v)}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: GRID }}
            contentStyle={{
              background: "rgb(26 33 52)",
              border: "1px solid rgb(52 64 92)",
              borderRadius: 12,
              color: "rgb(226 232 245)",
              fontSize: 12,
            }}
            labelStyle={{ color: "rgb(138 150 176)" }}
            formatter={(v: number) => [fmtCompact(v), "Views"]}
          />
          <Area
            type="monotone"
            dataKey="views"
            stroke={PRIMARY}
            strokeWidth={2}
            fill="url(#viewsFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
