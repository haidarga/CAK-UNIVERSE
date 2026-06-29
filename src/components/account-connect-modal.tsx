"use client";

import { useEffect, useRef, useState } from "react";
import { X, Cookie, KeyRound, Loader2, AlertTriangle, Unlink } from "lucide-react";
import { cn } from "@/lib/utils";

type Method = "cookie" | "credentials";

interface AccountConnectModalProps {
  accountId: string;
  platform: "tiktok" | "instagram";
  username: string;
  connected: boolean;
  onClose: () => void;
  onConnected: () => void;
  onDisconnected: () => void;
}

const PLATFORM_LABEL: Record<"tiktok" | "instagram", string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
};

/** Premium glass dialog for connecting an account by session cookie or credentials. */
export default function AccountConnectModal({
  accountId,
  platform,
  username,
  connected,
  onClose,
  onConnected,
  onDisconnected,
}: AccountConnectModalProps) {
  const [method, setMethod] = useState<Method>("cookie");
  const [cookiesRaw, setCookiesRaw] = useState("");
  const [label, setLabel] = useState("");
  const [user, setUser] = useState(username);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstFieldRef = useRef<HTMLTextAreaElement>(null);
  const platformName = PLATFORM_LABEL[platform];

  // Esc to close + focus first field on mount.
  useEffect(() => {
    firstFieldRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          method,
          ...(method === "cookie"
            ? { cookiesRaw, label: label || undefined }
            : { username: user, password: pass, label: label || undefined }),
        }),
      });
      const json = (await res.json()) as { success: boolean; error: string | null };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to connect");
      onConnected();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}/connect`, { method: "DELETE" });
      const json = (await res.json()) as { success: boolean; error: string | null };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to disconnect");
      onDisconnected();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disconnect");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-title"
        className="glass relative flex w-full max-w-md flex-col gap-4 p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-fg"
        >
          <X className="size-4" aria-hidden strokeWidth={1.5} />
        </button>

        <header className="flex flex-col gap-1 pr-8">
          <h2 id="connect-title" className="font-sans text-lg font-semibold text-fg">
            Connect @{username}
          </h2>
          <p className="text-xs text-muted">
            Store this {platformName} account&apos;s login session so warmup &amp; scraping act as it.
          </p>
        </header>

        {/* Method toggle */}
        <div role="tablist" aria-label="Connection method" className="glass-2 grid grid-cols-2 gap-1 rounded-xl p-1">
          {(["cookie", "credentials"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={method === m}
              onClick={() => setMethod(m)}
              className={cn(
                "flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors",
                method === m ? "bg-white/[0.08] text-fg shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]" : "text-muted hover:text-fg",
              )}
            >
              {m === "cookie" ? (
                <Cookie className="size-3.5" aria-hidden strokeWidth={1.5} />
              ) : (
                <KeyRound className="size-3.5" aria-hidden strokeWidth={1.5} />
              )}
              {m === "cookie" ? "Session cookie" : "Username & password"}
            </button>
          ))}
        </div>

        {method === "cookie" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cookie-input" className="text-xs font-medium text-fg">
                Session cookie
              </label>
              <textarea
                id="cookie-input"
                ref={firstFieldRef}
                value={cookiesRaw}
                onChange={(e) => setCookiesRaw(e.target.value)}
                rows={4}
                placeholder="sessionid value, or exported cookies JSON…"
                className="glass-2 resize-none rounded-lg px-3 py-2 font-mono text-xs text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
              <p className="text-[11px] leading-relaxed text-muted">
                Login to {platformName} in your browser, open DevTools → Application → Cookies, copy
                the <code className="rounded bg-white/[0.06] px-1">sessionid</code> value (or paste
                exported cookies JSON) and paste here.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="user-input" className="text-xs font-medium text-fg">
                Username
              </label>
              <input
                id="user-input"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                autoComplete="off"
                className="glass-2 min-h-[38px] rounded-lg px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pass-input" className="text-xs font-medium text-fg">
                Password
              </label>
              <input
                id="pass-input"
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete="new-password"
                className="glass-2 min-h-[38px] rounded-lg px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
            </div>
            <span className="chip border-amber-400/40 bg-amber-400/10 text-amber-300">
              <AlertTriangle className="size-3" aria-hidden strokeWidth={1.5} />
              Auto-login may hit captcha/2FA; session cookie is more reliable.
            </span>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="label-input" className="text-xs font-medium text-fg">
            Label <span className="text-muted">(optional)</span>
          </label>
          <input
            id="label-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. main phone session"
            className="glass-2 min-h-[38px] rounded-lg px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}

        <footer className="flex items-center justify-between gap-2 border-t border-border/60 pt-4">
          {connected ? (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="btn min-h-[38px] text-xs !bg-danger/10 text-danger ring-1 ring-danger/40 disabled:opacity-60"
            >
              <Unlink className="size-3.5" aria-hidden strokeWidth={1.5} />
              Disconnect
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            aria-busy={busy}
            className="btn btn-primary min-h-[38px] text-xs disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden strokeWidth={1.5} />
            ) : null}
            {busy ? "Saving…" : connected ? "Update" : "Connect"}
          </button>
        </footer>
      </div>
    </div>
  );
}
