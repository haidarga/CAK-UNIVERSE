"use client";

import { useState } from "react";
import { Clapperboard, Loader2, AlertTriangle, Film, ChevronDown, ChevronUp } from "lucide-react";
import type { Shot } from "@/lib/types";
import { cn } from "@/lib/utils";
import ShotRow from "@/components/studio/shot-row";

interface CreatorPanelProps {
  pipelineId: string;
  title: string;
  stage: string;
  scriptText: string;
  contextLine?: string;
  initialShots: Shot[];
}

type State = "idle" | "running" | "error";

interface GenerateResponse {
  success: boolean;
  error: string | null;
  data?: { success: boolean; shots?: Shot[]; error?: string };
}

/** Per-item panel: shows the script, generates shots, renders the shot list. */
export default function CreatorPanel({
  pipelineId,
  title,
  stage,
  scriptText,
  contextLine,
  initialShots,
}: CreatorPanelProps) {
  const [shots, setShots] = useState<Shot[]>(initialShots);
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [scriptOpen, setScriptOpen] = useState(initialShots.length === 0);

  async function generate() {
    if (state === "running") return;
    setState("running");
    setError(null);
    try {
      const res = await fetch("/api/agents/creator/generate-params", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineId }),
      });
      const json = (await res.json()) as GenerateResponse;
      const inner = json.data;
      if (!res.ok || !json.success || (inner && inner.success === false)) {
        throw new Error(inner?.error ?? json.error ?? "Shot generation failed");
      }
      const nextShots = inner?.shots ?? [];
      setShots(nextShots);
      setScriptOpen(false);
      setState("idle");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Shot generation failed");
    }
  }

  const totalDuration = shots.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);

  return (
    <article className="bezel h-full">
      <div className="glass flex h-full flex-col gap-4 p-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display truncate text-lg font-semibold text-fg">{title}</h2>
            {contextLine && <p className="mt-0.5 truncate text-xs text-muted">{contextLine}</p>}
          </div>
          <span className="chip shrink-0 border-border/60 bg-surface-2/60 capitalize text-muted">
            {stage.replace(/_/g, " ")}
          </span>
        </header>

        {/* Script (collapsible) */}
        <div className="glass-2 overflow-hidden rounded-xl">
          <button
            type="button"
            onClick={() => setScriptOpen((v) => !v)}
            aria-expanded={scriptOpen}
            className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left outline-none transition-colors hover:bg-surface-2/40 focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <span className="eyebrow flex items-center gap-2">
              <Film className="size-3.5" strokeWidth={1.5} aria-hidden />
              Script
            </span>
            {scriptOpen ? (
              <ChevronUp className="size-4 text-muted" strokeWidth={1.5} aria-hidden />
            ) : (
              <ChevronDown className="size-4 text-muted" strokeWidth={1.5} aria-hidden />
            )}
          </button>
          {scriptOpen && (
            <p className="max-h-48 overflow-y-auto whitespace-pre-wrap border-t border-border/60 px-3.5 py-3 text-sm leading-relaxed text-fg/90">
              {scriptText || "No script text on record."}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={generate}
            disabled={state === "running" || !scriptText}
            className={cn(
              "btn",
              state === "error"
                ? "border-danger/40 bg-danger/10 text-danger"
                : "btn-primary",
              (state === "running" || !scriptText) && "cursor-not-allowed opacity-70",
            )}
          >
            {state === "running" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : state === "error" ? (
              <AlertTriangle className="size-4" strokeWidth={1.5} aria-hidden />
            ) : (
              <Clapperboard className="size-4" strokeWidth={1.5} aria-hidden />
            )}
            {state === "running" ? "Generating shots…" : shots.length > 0 ? "Regenerate shots" : "Generate Shots"}
          </button>
          {shots.length > 0 && (
            <span className="tnum text-xs text-muted">
              {shots.length} shots · {Math.round(totalDuration)}s
            </span>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {shots.length > 0 && (
          <ol className="flex flex-col gap-3 border-t border-border/60 pt-3">
            {shots.map((shot, idx) => (
              <li key={`${shot.shot_number}-${idx}`}>
                <ShotRow shot={shot} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </article>
  );
}
