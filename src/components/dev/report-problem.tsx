"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { AlertTriangle, Loader2, X, Send, Check } from "lucide-react";
import AiAssistInline from "@/components/ai-assist-inline";
import type { TeamMember } from "@/lib/types";
import { DEV_SEVERITY, DEV_AREAS, type DevSeverity, type DevArea } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface ReportProblemProps {
  team: TeamMember[];
}

interface TriageData {
  severity?: DevSeverity;
  area?: DevArea;
  suggested_title?: string;
  first_steps?: string;
}

const SEVERITY_LABEL: Record<DevSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const AREA_LABEL: Record<DevArea, string> = {
  frontend: "Frontend",
  backend: "Backend",
  agent: "AI Agent",
  infra: "Infrastructure",
  data: "Data",
  general: "General / not sure",
};

/** Friendly "Report a Problem" modal. Anyone on the team can use it. */
export default function ReportProblem({ team }: ReportProblemProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [area, setArea] = useState<DevArea>("general");
  const [severity, setSeverity] = useState<DevSeverity>("medium");
  const [reportedBy, setReportedBy] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const router = useRouter();
  const [, startTransition] = useTransition();
  const titleId = useId();
  const descId = useId();
  const areaId = useId();
  const sevId = useId();
  const byId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Close on Escape; focus the first field on open.
  useEffect(() => {
    if (!open) return;
    firstFieldRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function reset() {
    setTitle("");
    setDescription("");
    setArea("general");
    setSeverity("medium");
    setReportedBy("");
    setError(null);
    setDone(false);
  }

  function applyTriage(data: unknown) {
    const t = (data ?? {}) as TriageData;
    if (t.suggested_title && !title.trim()) setTitle(t.suggested_title);
    if (t.severity && (DEV_SEVERITY as readonly string[]).includes(t.severity)) {
      setSeverity(t.severity);
    }
    if (t.area && (DEV_AREAS as readonly string[]).includes(t.area)) {
      setArea(t.area);
    }
    if (t.first_steps) {
      setDescription((prev) =>
        prev.includes(t.first_steps as string) ? prev : `${prev}\n\nSuggested first steps: ${t.first_steps}`.trim(),
      );
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!title.trim()) {
      setError("Please add a short title so we know what's broken.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/dev-issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          severity,
          area,
          reported_by: reportedBy || null,
        }),
      });
      const json = (await res.json()) as { success: boolean; error: string | null };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Could not send your report");
      setDone(true);
      startTransition(() => router.refresh());
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 1100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-accent/40 bg-accent/15 px-4 py-2 text-sm font-semibold text-fg outline-none transition-colors hover:bg-accent/25 focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <AlertTriangle className="size-4 text-accent" aria-hidden />
        Report a Problem
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-bg/70 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${titleId}-h`}
            className="glass animate-fade-up flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden p-0 text-left"
          >
            <header className="flex items-center justify-between gap-3 border-b border-border/60 p-5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-accent" aria-hidden />
                <h2 id={`${titleId}-h`} className="text-base font-semibold text-fg">
                  Report a Problem
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid size-9 place-items-center rounded-lg text-muted outline-none transition-colors hover:bg-surface-2/70 hover:text-fg focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>

            <form onSubmit={submit} className="flex flex-col gap-4 overflow-y-auto p-5">
              <p className="text-sm text-muted">
                Tell us what went wrong in your own words. Not sure how serious it is? Use{" "}
                <span className="text-fg">AI triage</span> below and we&apos;ll fill in the details.
              </p>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={descId} className="text-xs font-medium text-fg/90">
                  What happened?
                </label>
                <textarea
                  id={descId}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="e.g. The QC page shows a blank screen after I click Run AI QC…"
                  className="w-full resize-y rounded-xl border border-border bg-surface-2/50 px-3.5 py-2.5 text-sm text-fg outline-none transition-colors placeholder:text-muted/70 focus-visible:ring-2 focus-visible:ring-primary/60"
                />
                <AiAssistInline
                  tool="issue_triage"
                  getInput={() => description}
                  label="AI triage this"
                  onResult={(r: { text: string; data?: unknown }) => applyTriage(r.data)}
                  className="mt-1"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={titleId} className="text-xs font-medium text-fg/90">
                  Short title
                </label>
                <input
                  id={titleId}
                  ref={firstFieldRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="One line summary"
                  className="w-full rounded-xl border border-border bg-surface-2/50 px-3.5 py-2.5 text-sm text-fg outline-none transition-colors placeholder:text-muted/70 focus-visible:ring-2 focus-visible:ring-primary/60"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={areaId} className="text-xs font-medium text-fg/90">
                    Area
                  </label>
                  <select
                    id={areaId}
                    value={area}
                    onChange={(e) => setArea(e.target.value as DevArea)}
                    className="min-h-[44px] cursor-pointer appearance-none rounded-xl border border-border bg-surface-2/50 px-3.5 py-2.5 text-sm text-fg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    {DEV_AREAS.map((a) => (
                      <option key={a} value={a}>
                        {AREA_LABEL[a]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor={sevId} className="text-xs font-medium text-fg/90">
                    How serious?
                  </label>
                  <select
                    id={sevId}
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as DevSeverity)}
                    className="min-h-[44px] cursor-pointer appearance-none rounded-xl border border-border bg-surface-2/50 px-3.5 py-2.5 text-sm text-fg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    {DEV_SEVERITY.map((s) => (
                      <option key={s} value={s}>
                        {SEVERITY_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={byId} className="text-xs font-medium text-fg/90">
                  Who&apos;s reporting? <span className="text-muted">(optional)</span>
                </label>
                <select
                  id={byId}
                  value={reportedBy}
                  onChange={(e) => setReportedBy(e.target.value)}
                  className="min-h-[44px] cursor-pointer appearance-none rounded-xl border border-border bg-surface-2/50 px-3.5 py-2.5 text-sm text-fg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <option value="">Anonymous</option>
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="min-h-[44px] rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted outline-none transition-colors hover:bg-surface-2/60 hover:text-fg focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || done}
                  className={cn(
                    "flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60",
                    done
                      ? "border-success/40 bg-success/15 text-success"
                      : "border-primary/40 bg-primary/15 text-fg hover:bg-primary/25",
                    submitting && "cursor-not-allowed opacity-70",
                  )}
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : done ? (
                    <Check className="size-4" aria-hidden />
                  ) : (
                    <Send className="size-4" aria-hidden />
                  )}
                  {done ? "Sent — thank you!" : submitting ? "Sending…" : "Send report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
