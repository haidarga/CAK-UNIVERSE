"use client";

import { AlertTriangle, CheckCircle } from "lucide-react";

interface GuardrailBannerProps {
  violations: string[];
  /** Whether any guardrails are configured at all. */
  hasRules: boolean;
}

/**
 * Live guardrail status banner. Red when violations are present, green when
 * the draft is clean. Updates in real time as the writer types.
 */
export default function GuardrailBanner({ violations, hasRules }: GuardrailBannerProps) {
  if (!hasRules) return null;

  if (violations.length === 0) {
    return (
      <div
        role="status"
        className="animate-fade-up flex items-center gap-3 rounded-[1rem] border border-success/30 bg-success/10 px-4 py-3 text-sm text-success shadow-[0_0_0_1px_rgba(16,185,129,0.06),0_8px_24px_-12px_rgba(16,185,129,0.35)]"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-success/15 ring-1 ring-success/30">
          <CheckCircle className="size-4" aria-hidden />
        </span>
        <span className="font-medium">All clear — no guardrail violations.</span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="animate-fade-up rounded-[1rem] border border-danger/40 bg-danger/10 px-4 py-3.5 text-sm text-danger shadow-[0_0_0_1px_rgba(239,68,68,0.1),0_12px_40px_-12px_rgba(239,68,68,0.5)]"
    >
      <div className="flex items-center gap-3 font-display font-semibold tracking-tight">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-danger/20 ring-1 ring-danger/40 animate-pulse-dot">
          <AlertTriangle className="size-4" aria-hidden />
        </span>
        <span className="tnum">
          {violations.length} guardrail {violations.length === 1 ? "violation" : "violations"}
        </span>
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-1.5 pl-10">
        {violations.map((v) => (
          <li key={v} className="chip border-danger/50 bg-danger/15 text-danger">
            {v}
          </li>
        ))}
      </ul>
    </div>
  );
}
