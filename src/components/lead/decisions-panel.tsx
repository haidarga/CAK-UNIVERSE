"use client";

import { useState } from "react";
import { Loader2, Gavel, AlertTriangle, Lightbulb, ArrowRight, Zap } from "lucide-react";
import GlassCard from "@/components/glass-card";

interface Decision {
  decision: string;
  rationale: string;
  how_to_solve: string[];
  owner: string;
}
interface Problem {
  problem: string;
  evidence: string;
  severity: "high" | "medium" | "low";
}
interface DecisionReport {
  situation?: string;
  problems?: Problem[];
  decisions?: Decision[];
  quick_wins?: string[];
}

const OWNER_LABEL: Record<string, string> = {
  strategist: "Strategist",
  script_writer: "Script Writer",
  creator: "Creator",
  head_of_creator: "Head of Creator",
  account_monitor: "Account Monitor",
  lead: "Lead",
};

const SEV_CLS: Record<string, string> = {
  high: "border-danger/40 bg-danger/10 text-danger",
  medium: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  low: "border-border bg-surface-2/40 text-muted",
};

function coerce(data: unknown): DecisionReport | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  // LLM output shape is untrusted — force arrays so .map() can never throw.
  return {
    situation: typeof d.situation === "string" ? d.situation : undefined,
    problems: Array.isArray(d.problems) ? (d.problems as Problem[]) : [],
    decisions: Array.isArray(d.decisions) ? (d.decisions as Decision[]) : [],
    quick_wins: Array.isArray(d.quick_wins)
      ? d.quick_wins.filter((x): x is string => typeof x === "string")
      : [],
  };
}

export default function DecisionsPanel({ brandId }: { brandId: string }) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DecisionReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/lead/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      const json: { success?: boolean; data?: unknown; error?: string } = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error ?? "Gagal buat keputusan");
      const r = coerce(json.data);
      if (!r) throw new Error("Respon AI tidak terbaca");
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal buat keputusan");
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassCard title="Keputusan & solusi (Lead)" icon={Gavel} noHover>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="btn btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden strokeWidth={1.5} />
          ) : (
            <Gavel className="size-4" aria-hidden strokeWidth={1.5} />
          )}
          {report ? "Analisa ulang" : "Analisa & putuskan"}
        </button>
        <p className="text-xs text-muted">
          Lead baca KPI + pipeline + akun bermasalah + isu → diagnosa + keputusan + siapa ngerjain.
        </p>
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-danger/30 bg-danger/[0.06] px-4 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      {loading && (
        <div className="mt-4 flex items-center gap-2 py-6 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden strokeWidth={1.5} />
          Lead lagi nimbang keputusan…
        </div>
      )}

      {report && !loading && (
        <div className="mt-4 flex flex-col gap-5">
          {report.situation && (
            <p className="rounded-2xl border border-accent/20 bg-accent/[0.04] px-4 py-3 text-sm font-medium leading-snug text-fg">
              {report.situation}
            </p>
          )}

          {report.problems && report.problems.length > 0 && (
            <section>
              <p className="eyebrow mb-2 flex items-center gap-1.5 text-muted">
                <AlertTriangle className="size-3.5" aria-hidden strokeWidth={1.5} /> Masalah
              </p>
              <div className="flex flex-col gap-2">
                {report.problems.map((p, i) => (
                  <div key={i} className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-surface-2/40 px-3.5 py-2.5">
                    <span className={`chip shrink-0 ${SEV_CLS[p.severity] ?? SEV_CLS.low}`}>{p.severity}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg">{p.problem}</p>
                      {p.evidence && <p className="mt-0.5 text-xs text-muted">{p.evidence}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {report.decisions && report.decisions.length > 0 && (
            <section>
              <p className="eyebrow mb-2 flex items-center gap-1.5 text-accent">
                <Gavel className="size-3.5" aria-hidden strokeWidth={1.5} /> Keputusan
              </p>
              <div className="flex flex-col gap-3">
                {report.decisions.map((d, i) => (
                  <div key={i} className="glass-2 rounded-2xl border border-accent/15 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-fg">{d.decision}</p>
                      <span className="chip shrink-0 border-primary/30 bg-primary/10 text-primary">
                        {OWNER_LABEL[d.owner] ?? d.owner}
                      </span>
                    </div>
                    {d.rationale && <p className="mt-1 text-xs text-muted">{d.rationale}</p>}
                    {d.how_to_solve && d.how_to_solve.length > 0 && (
                      <ul className="mt-2.5 flex flex-col gap-1.5">
                        {d.how_to_solve.map((step, j) => (
                          <li key={j} className="flex gap-2 text-sm text-fg/90">
                            <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden strokeWidth={1.5} />
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {report.quick_wins && report.quick_wins.length > 0 && (
            <section>
              <p className="eyebrow mb-2 flex items-center gap-1.5 text-success">
                <Zap className="size-3.5" aria-hidden strokeWidth={1.5} /> Quick wins
              </p>
              <ul className="flex flex-col gap-1.5">
                {report.quick_wins.map((q, i) => (
                  <li key={i} className="flex gap-2 text-sm text-fg/90">
                    <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden strokeWidth={1.5} />
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </GlassCard>
  );
}
