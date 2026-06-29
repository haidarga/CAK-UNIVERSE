"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";

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
        className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3.5 py-2.5 text-sm text-success"
      >
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        <span>No guardrail violations.</span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="animate-fade-up rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-3 text-sm text-danger"
    >
      <div className="flex items-center gap-2 font-semibold">
        <ShieldAlert className="size-4 shrink-0" aria-hidden />
        <span>
          {violations.length} guardrail {violations.length === 1 ? "violation" : "violations"}
        </span>
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {violations.map((v) => (
          <li key={v} className="chip border-danger/40 bg-danger/15 text-danger">
            {v}
          </li>
        ))}
      </ul>
    </div>
  );
}
