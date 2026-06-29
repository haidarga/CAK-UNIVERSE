"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, LogIn, LogOut, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface GoogleStatus {
  connected: boolean;
  email?: string | null;
}

interface StatusResponse {
  success: boolean;
  error: string | null;
  data: GoogleStatus | null;
}

type Phase = "loading" | "ready" | "working" | "error";

/** Connect / disconnect Google OAuth (Docs / Sheets / Drive). */
export default function GoogleConnectButton() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [status, setStatus] = useState<GoogleStatus>({ connected: false });
  const [msg, setMsg] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/google", { cache: "no-store" });
      const json = (await res.json()) as StatusResponse;
      if (!res.ok || !json.success || !json.data) throw new Error(json.error ?? "Status check failed");
      setStatus(json.data);
      setPhase("ready");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Status check failed");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function disconnect() {
    setPhase("working");
    setMsg(null);
    try {
      const res = await fetch("/api/integrations/google", { method: "DELETE" });
      const json = (await res.json()) as { success: boolean; error: string | null };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Disconnect failed");
      setStatus({ connected: false });
      setPhase("ready");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Disconnect failed");
      setPhase("error");
    }
  }

  if (phase === "loading") {
    return (
      <span className="flex items-center gap-1.5 text-[10px] text-muted">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Checking Google…
      </span>
    );
  }

  if (status.connected) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="chip border-success/40 bg-success/10 text-success">
            <CheckCircle2 className="size-3" strokeWidth={1.5} aria-hidden />
            {status.email ?? "Connected"}
          </span>
          <button
            type="button"
            onClick={disconnect}
            disabled={phase === "working"}
            aria-label="Disconnect Google account"
            className={cn("btn text-xs", phase === "working" && "cursor-not-allowed opacity-60")}
          >
            {phase === "working" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <LogOut className="size-3.5" strokeWidth={1.5} aria-hidden />
            )}
            Disconnect
          </button>
        </div>
        {msg && (
          <span className="flex items-center gap-1 text-[10px] text-danger" role="alert">
            <AlertTriangle className="size-3" strokeWidth={1.5} aria-hidden />
            {msg}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <a href="/api/integrations/google/auth" className="btn btn-primary text-xs" aria-label="Connect Google account">
        <LogIn className="size-3.5" strokeWidth={1.5} aria-hidden />
        Connect Google
      </a>
      {msg && (
        <span className="flex items-center gap-1 text-[10px] text-danger" role="alert">
          <AlertTriangle className="size-3" strokeWidth={1.5} aria-hidden />
          {msg}
        </span>
      )}
    </div>
  );
}
