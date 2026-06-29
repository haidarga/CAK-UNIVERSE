"use client";

import { useState } from "react";
import { ShieldCheck, Loader2, AlertTriangle, Check, X, CircleDashed } from "lucide-react";
import AiAssistInline from "@/components/ai-assist-inline";
import ScoreRing from "@/components/score-ring";
import type { QCReport } from "@/lib/types";
import { cn } from "@/lib/utils";

interface QcPanelProps {
  pipelineId: string;
  title: string;
  stage: string;
  summary: string;
  videoDescription: string;
  initialReport: QCReport | null;
}

type State = "idle" | "running" | "error";

// Sub-scores are 0-100 (see VIDEO_QC_SYSTEM). Pass threshold = 60.
const QC_PASS_THRESHOLD = 60;

interface QcResponse {
  success: boolean;
  error: string | null;
  data?: { success: boolean; report?: QCReport; error?: string };
}

function checklistRows(report: QCReport | null): { label: string; value: number | undefined }[] {
  return [
    { label: "Hook strength", value: report?.hook_strength },
    { label: "Brand voice match", value: report?.brand_voice_match },
    { label: "Visual quality", value: report?.visual_quality },
  ];
}

function CheckIcon({ value }: { value: number | undefined }) {
  if (value == null) return <CircleDashed className="size-4 text-muted" aria-label="not scored" />;
  if (value >= QC_PASS_THRESHOLD) return <Check className="size-4 text-success" aria-label="pass" />;
  return <X className="size-4 text-danger" aria-label="fail" />;
}

/** Per-item QC: checklist + score ring, Run AI QC, per-issue fix guidance. */
export default function QcPanel({
  pipelineId,
  title,
  stage,
  summary,
  videoDescription,
  initialReport,
}: QcPanelProps) {
  const [report, setReport] = useState<QCReport | null>(initialReport);
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  async function runQc() {
    if (state === "running") return;
    setState("running");
    setError(null);
    try {
      const res = await fetch("/api/agents/head-of-creator/qc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineId, videoDescription }),
      });
      const json = (await res.json()) as QcResponse;
      const inner = json.data;
      if (!res.ok || !json.success || (inner && inner.success === false)) {
        throw new Error(inner?.error ?? json.error ?? "QC failed");
      }
      if (inner?.report) setReport(inner.report);
      setState("idle");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "QC failed");
    }
  }

  const passTone =
    report == null
      ? "border-border bg-surface-2/60 text-muted"
      : report.passed
        ? "border-success/40 bg-success/10 text-success"
        : "border-danger/40 bg-danger/10 text-danger";

  return (
    <article className="glass flex flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-fg">{title}</h2>
            <span className={cn("chip shrink-0 capitalize", passTone)}>
              {report == null ? stage.replace(/_/g, " ") : report.passed ? "Passed" : "Failed"}
            </span>
          </div>
          <p className="mt-1 line-clamp-3 text-sm text-muted">{summary}</p>
        </div>
        {report && <ScoreRing score={report.score} />}
      </header>

      <ul className="flex flex-col gap-2 border-t border-border/60 pt-3">
        {checklistRows(report).map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-fg/90">
              <CheckIcon value={row.value} />
              {row.label}
            </span>
            <span className="tnum text-xs text-muted">
              {row.value == null ? "—" : `${Math.round(row.value)}/100`}
            </span>
          </li>
        ))}
      </ul>

      {report?.issues && report.issues.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Issues &amp; how to fix
          </span>
          <ul className="flex flex-col gap-2.5">
            {report.issues.map((issue, idx) => (
              <li key={`${idx}-${issue.slice(0, 24)}`} className="flex flex-col gap-1.5">
                <span className="flex items-start gap-2 text-sm text-fg/90">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                  {issue}
                </span>
                <AiAssistInline
                  tool="qc_explain"
                  getInput={() => issue}
                  context={`Video: ${title}`}
                  label="Explain the fix"
                  className="pl-5"
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {report?.recommendations && report.recommendations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {report.recommendations.slice(0, 4).map((rec, idx) => (
            <span key={`${idx}-rec`} className="chip border-primary/30 bg-primary/10 text-primary">
              {rec}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={runQc}
          disabled={state === "running"}
          className={cn(
            "flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60",
            state === "error"
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-primary/40 bg-primary/15 text-fg hover:bg-primary/25",
            state === "running" && "cursor-not-allowed opacity-70",
          )}
        >
          {state === "running" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : state === "error" ? (
            <AlertTriangle className="size-4" aria-hidden />
          ) : (
            <ShieldCheck className="size-4" aria-hidden />
          )}
          {state === "running" ? "Running QC…" : report ? "Re-run AI QC" : "Run AI QC"}
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </article>
  );
}
