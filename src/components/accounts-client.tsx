"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ScanLine, Loader2, Check, AlertTriangle, ChevronDown } from "lucide-react";
import type { Account, Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import AccountCard from "./account-card";
import EmptyState from "./empty-state";

type ScanState = "idle" | "running" | "done" | "error";

type PhaseFilter = "all" | "cold" | "warming" | "warm" | "active" | "flagged";

const PHASE_TABS: { key: PhaseFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "cold", label: "Cold" },
  { key: "warming", label: "Warming" },
  { key: "warm", label: "Warm" },
  { key: "active", label: "Active" },
  { key: "flagged", label: "Flagged" },
];

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

interface AccountsClientProps {
  brands: Pick<Brand, "id" | "name">[];
  initialBrandId: string | null;
  initialAccounts: Account[];
  onCounts?: (accounts: Account[]) => void;
}

/**
 * Interactive accounts surface: brand selector + phase tabs + Run Scan.
 * Re-fetches /api/accounts on brand/phase change; "flagged" is derived
 * client-side (anomaly_flags or status === "flagged").
 */
export default function AccountsClient({
  brands,
  initialBrandId,
  initialAccounts,
}: AccountsClientProps) {
  const [brandId, setBrandId] = useState<string | null>(initialBrandId);
  const [phase, setPhase] = useState<PhaseFilter>("all");
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanState>("idle");
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  // Skip the very first effect run so we keep server-rendered initial data.
  const [hydrated, setHydrated] = useState(false);

  const fetchAccounts = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ brandId });
      // "flagged" is derived, not a DB column — fetch all then filter locally.
      if (phase !== "all" && phase !== "flagged") params.set("phase", phase);
      const res = await fetch(`/api/accounts?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as ApiEnvelope<Account[]>;
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to load accounts");
      setAccounts(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load accounts");
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [brandId, phase]);

  useEffect(() => {
    if (!hydrated) {
      setHydrated(true);
      return;
    }
    void fetchAccounts();
  }, [fetchAccounts, hydrated]);

  const visible = useMemo(() => {
    if (phase !== "flagged") return accounts;
    return accounts.filter((a) => (a.anomaly_flags?.length ?? 0) > 0 || a.status === "flagged");
  }, [accounts, phase]);

  async function runScan() {
    if (!brandId || scan === "running") return;
    setScan("running");
    setScanMsg(null);
    try {
      const res = await fetch("/api/agents/account-monitor/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      const json = (await res.json()) as ApiEnvelope<unknown>;
      if (!res.ok || !json.success) throw new Error(json.error ?? "Scan failed");
      setScan("done");
      await fetchAccounts();
      setTimeout(() => setScan("idle"), 2500);
    } catch (e) {
      setScan("error");
      setScanMsg(e instanceof Error ? e.message : "Scan failed");
      setTimeout(() => setScan("idle"), 4000);
    }
  }

  const scanDisabled = scan === "running" || !brandId;

  return (
    <div className="flex flex-col gap-5">
      {/* Controls row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Brand selector */}
          <label className="relative">
            <span className="sr-only">Select brand</span>
            <select
              value={brandId ?? ""}
              onChange={(e) => setBrandId(e.target.value || null)}
              disabled={brands.length === 0}
              className="glass-2 min-h-[44px] cursor-pointer appearance-none py-2 pl-3.5 pr-9 text-sm font-semibold text-fg outline-none transition-colors hover:border-white/20 focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {brands.length === 0 && <option value="">No brands</option>}
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
          </label>

          {/* Run Scan */}
          <button
            type="button"
            onClick={runScan}
            disabled={scanDisabled}
            className={cn(
              "btn min-h-[44px]",
              scan === "error"
                ? "!bg-danger/10 text-danger ring-1 ring-danger/40"
                : scan === "done"
                  ? "!bg-success/10 text-success ring-1 ring-success/40"
                  : "btn-primary",
              scanDisabled && "cursor-not-allowed opacity-70",
            )}
          >
            {scan === "running" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : scan === "done" ? (
              <Check className="size-4" aria-hidden />
            ) : scan === "error" ? (
              <AlertTriangle className="size-4" aria-hidden />
            ) : (
              <ScanLine className="size-4" aria-hidden />
            )}
            {scan === "running" ? "Scanning…" : scan === "done" ? "Scan complete" : "Run Scan"}
          </button>
          {scanMsg && <span className="text-xs text-danger">{scanMsg}</span>}
        </div>

        {/* Phase filter tabs */}
        <div
          role="tablist"
          aria-label="Filter by phase"
          className="glass-2 flex items-center gap-1 rounded-full p-1"
        >
          {PHASE_TABS.map((t) => {
            const active = phase === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setPhase(t.key)}
                className={cn(
                  "cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary/60",
                  active
                    ? "bg-gradient-to-b from-primary to-primary/80 text-white shadow-[0_6px_20px_-8px_rgba(99,132,255,0.8)]"
                    : "text-muted hover:bg-white/[0.05] hover:text-fg",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results */}
      {error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Could not load accounts"
          hint={error}
        />
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading accounts…
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          title="No accounts match"
          hint="Try a different phase filter or run a scan to refresh account data."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((a) => (
            <AccountCard key={a.id} account={a} />
          ))}
        </div>
      )}
    </div>
  );
}
