"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Flame, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WarmupRun } from "@/lib/types";

interface WarmupButtonProps {
  accountId: string;
}

type State = "idle" | "running" | "done" | "error";

/** Kicks off a human-like warmup session for a connected account. */
const DURATIONS = [5, 10, 15, 30, 45] as const;

export default function WarmupButton({ accountId }: WarmupButtonProps) {
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number>(10);
  const router = useRouter();
  const [, startTransition] = useTransition();

  async function run() {
    if (state === "running") return;
    setState("running");
    setResult(null);
    try {
      const res = await fetch("/api/warmup/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, minutes }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data: WarmupRun | null;
        error: string | null;
      };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Warmup failed");

      const run = json.data;
      if (run && run.status === "skipped") {
        setResult(run.note ?? "skipped");
      } else if (run) {
        setResult(`✓ ${run.likes} likes · ${run.comments} comments`);
      } else {
        setResult("✓ done");
      }
      setState("done");
      startTransition(() => router.refresh());
      setTimeout(() => setState("idle"), 4000);
    } catch (e) {
      setState("error");
      setResult(e instanceof Error ? e.message : "Warmup failed");
      setTimeout(() => setState("idle"), 4000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={minutes}
        onChange={(e) => setMinutes(Number(e.target.value))}
        disabled={state === "running"}
        aria-label="Warmup duration in minutes"
        className="glass-2 min-h-[36px] rounded-lg px-2 text-xs text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-60"
      >
        {DURATIONS.map((m) => (
          <option key={m} value={m}>
            {m}m
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={run}
        disabled={state === "running"}
        aria-label="Run warmup session for this account"
        aria-busy={state === "running"}
        className={cn(
          "btn min-h-[36px] text-xs",
          state === "error"
            ? "!bg-danger/10 text-danger ring-1 ring-danger/40"
            : state === "done"
              ? "!bg-success/10 text-success ring-1 ring-success/40"
              : "btn-primary",
          state === "running" && "cursor-not-allowed opacity-70",
        )}
      >
        {state === "running" ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden strokeWidth={1.5} />
        ) : state === "error" ? (
          <AlertTriangle className="size-3.5" aria-hidden strokeWidth={1.5} />
        ) : (
          <Flame className="size-3.5" aria-hidden strokeWidth={1.5} />
        )}
        {state === "running" ? "Warming…" : "Warmup"}
      </button>
      {result && state !== "running" && (
        <span
          className={cn(
            "truncate text-[11px]",
            state === "error" ? "text-danger" : "text-muted",
          )}
        >
          {result}
        </span>
      )}
    </div>
  );
}
