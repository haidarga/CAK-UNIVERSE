"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ShieldCheck, Loader2, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface QcRunButtonProps {
  pipelineId: string;
  /** Description of the produced video sent to the QC agent. */
  videoDescription: string;
}

type State = "idle" | "running" | "done" | "error";

/** Triggers the Head-of-Creator AI QC review for a pipeline item. */
export default function QcRunButton({ pipelineId, videoDescription }: QcRunButtonProps) {
  const [state, setState] = useState<State>("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  async function run() {
    if (state === "running") return;
    setState("running");
    setMsg(null);
    try {
      const res = await fetch("/api/agents/head-of-creator/qc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineId, videoDescription }),
      });
      const json = (await res.json()) as { success: boolean; error: string | null };
      if (!res.ok || !json.success) throw new Error(json.error ?? "QC failed");
      setState("done");
      startTransition(() => router.refresh());
      setTimeout(() => setState("idle"), 2500);
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "QC failed");
      setTimeout(() => setState("idle"), 4000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={state === "running"}
        className={cn(
          "btn min-h-[40px]",
          state === "error"
            ? "!bg-danger/10 text-danger ring-1 ring-danger/40"
            : state === "done"
              ? "!bg-success/10 text-success ring-1 ring-success/40"
              : "btn-primary",
          state === "running" && "cursor-not-allowed opacity-70",
        )}
      >
        {state === "running" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : state === "done" ? (
          <Check className="size-4" aria-hidden />
        ) : state === "error" ? (
          <AlertTriangle className="size-4" aria-hidden />
        ) : (
          <ShieldCheck className="size-4" aria-hidden />
        )}
        {state === "running" ? "Running QC…" : state === "done" ? "QC done" : "Run AI QC"}
      </button>
      {msg && <span className="text-xs text-danger">{msg}</span>}
    </div>
  );
}
