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

const AXIS = "rgb(140 150 178)";
const GRID = "rgb(60 70 100 / 0.35)";
const PRIMARY = "rgb(99 132 255)";

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
              <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.4} />
              <stop offset="60%" stopColor={PRIMARY} stopOpacity={0.1} />
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
            cursor={{ stroke: PRIMARY, strokeOpacity: 0.4, strokeDasharray: "4 4" }}
            contentStyle={{
              background: "rgba(19 22 34 / 0.85)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 14,
              boxShadow: "0 24px 60px -28px rgba(0,0,0,0.85)",
              color: "rgb(233 237 248)",
              fontSize: 12,
            }}
            labelStyle={{ color: "rgb(140 150 178)" }}
            formatter={(v: number) => [fmtCompact(v), "Views"]}
          />
          <Area
            type="monotone"
            dataKey="views"
            stroke={PRIMARY}
            strokeWidth={2.5}
            fill="url(#viewsFill)"
            activeDot={{ r: 4, fill: PRIMARY, stroke: "rgb(6 7 12)", strokeWidth: 2 }}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
