"use client";

import { useEffect, useState } from "react";
import { Link2, Unlink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import AccountConnectModal from "./account-connect-modal";

interface AccountConnectProps {
  accountId: string;
  platform: "tiktok" | "instagram";
  username: string;
}

interface SafeStatus {
  connected: boolean;
}

/** Status pill + modal launcher to connect a real account's login session. */
export default function AccountConnect({ accountId, platform, username }: AccountConnectProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/accounts/${accountId}/connect`, { method: "GET" });
        const json = (await res.json()) as { success: boolean; data: SafeStatus | null };
        if (alive) setConnected(json.success && json.data ? json.data.connected : false);
      } catch {
        if (alive) setConnected(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [accountId]);

  const isLoading = connected === null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={connected ? `${username} connected — manage session` : `Connect ${username}`}
        className={cn(
          "chip transition-colors",
          isLoading
            ? "border-white/10 bg-white/[0.03] text-muted"
            : connected
              ? "border-success/40 bg-success/10 text-success hover:bg-success/15"
              : "border-white/10 bg-white/[0.03] text-muted hover:text-fg",
        )}
      >
        {isLoading ? (
          <Loader2 className="size-3 animate-spin" aria-hidden strokeWidth={1.5} />
        ) : connected ? (
          <Link2 className="size-3" aria-hidden strokeWidth={1.5} />
        ) : (
          <Unlink className="size-3" aria-hidden strokeWidth={1.5} />
        )}
        {isLoading ? "…" : connected ? "Connected" : "Not connected"}
      </button>

      {open && (
        <AccountConnectModal
          accountId={accountId}
          platform={platform}
          username={username}
          connected={connected === true}
          onClose={() => setOpen(false)}
          onConnected={() => {
            setConnected(true);
            setOpen(false);
          }}
          onDisconnected={() => {
            setConnected(false);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
