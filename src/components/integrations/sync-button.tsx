"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw, Loader2, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncButtonProps {
  provider: string;
  /** Disable when required env vars are missing. */
  disabled?: boolean;
}

type State = "idle" | "running" | "done" | "error";

interface SyncResponse {
  success: boolean;
  error: string | null;
  data: { ok: boolean; itemsSynced: number; note?: string; error?: string } | null;
}

/** Triggers POST /api/integrations/sync for a single provider. */
export default function SyncButton({ provider, disabled = false }: SyncButtonProps) {
  const [state, setState] = useState<State>("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  async function run() {
    if (state === "running" || disabled) return;
    setState("running");
    setMsg(null);
    try {
      const res = await fetch("/api/integrations/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const json = (await res.json()) as SyncResponse;
      if (!res.ok || !json.success) throw new Error(json.error ?? "Sync failed");
      if (json.data && !json.data.ok) throw new Error(json.data.error ?? "Sync failed");

      setState("done");
      setMsg(json.data?.note ?? `Synced ${json.data?.itemsSynced ?? 0}`);
      startTransition(() => router.refresh());
      setTimeout(() => setState("idle"), 2800);
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "Sync failed");
      setTimeout(() => setState("idle"), 4500);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={run}
        disabled={state === "running" || disabled}
        title={disabled ? "Set the required env vars first" : undefined}
        className={cn(
          "flex min-h-[36px] cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary/60",
          state === "error"
            ? "border-danger/40 bg-danger/10 text-danger"
            : state === "done"
              ? "border-success/40 bg-success/10 text-success"
              : "border-primary/40 bg-primary/15 text-fg hover:bg-primary/25",
          (state === "running" || disabled) && "cursor-not-allowed opacity-60",
        )}
      >
        {state === "running" ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : state === "done" ? (
          <Check className="size-3.5" aria-hidden />
        ) : state === "error" ? (
          <AlertTriangle className="size-3.5" aria-hidden />
        ) : (
          <RefreshCw className="size-3.5" aria-hidden />
        )}
        {state === "running" ? "Syncing…" : state === "done" ? "Synced" : "Sync now"}
      </button>
      {msg && (
        <span className={cn("truncate text-[10px]", state === "error" ? "text-danger" : "text-muted")}>
          {msg}
        </span>
      )}
    </div>
  );
}
