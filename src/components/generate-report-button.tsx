"use client";

import { useState } from "react";
import { FileBarChart, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import Markdown from "./markdown";

type State = "idle" | "running" | "error";

/** Generates an executive report for a brand and renders the returned markdown. */
export default function GenerateReportButton({ brandId }: { brandId: string }) {
  const [state, setState] = useState<State>("idle");
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    if (state === "running") return;
    setState("running");
    setMsg(null);
    try {
      const res = await fetch("/api/agents/lead/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data: { markdown: string } | null;
        error: string | null;
      };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Report failed");
      setMarkdown(json.data?.markdown ?? "");
      setState("idle");
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "Report failed");
      setTimeout(() => setState("idle"), 4000);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={state === "running"}
          className={cn(
            "btn min-h-[44px]",
            state === "error" ? "!bg-danger/10 text-danger ring-1 ring-danger/40" : "btn-primary",
            state === "running" && "cursor-not-allowed opacity-70",
          )}
        >
          {state === "running" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : state === "error" ? (
            <AlertTriangle className="size-4" aria-hidden />
          ) : (
            <FileBarChart className="size-4" aria-hidden />
          )}
          {state === "running" ? "Generating…" : "Generate Report"}
        </button>
        {msg && <span className="text-xs text-danger">{msg}</span>}
      </div>

      {markdown != null && (
        <div className="bezel animate-fade-up">
          <div className="glass p-6">
            <Markdown source={markdown} />
          </div>
        </div>
      )}
    </div>
  );
}
