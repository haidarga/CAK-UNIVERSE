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
            "flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary/60",
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
            <FileBarChart className="size-4" aria-hidden />
          )}
          {state === "running" ? "Generating…" : "Generate Report"}
        </button>
        {msg && <span className="text-xs text-danger">{msg}</span>}
      </div>

      {markdown != null && (
        <div className="glass p-5">
          <Markdown source={markdown} />
        </div>
      )}
    </div>
  );
}
