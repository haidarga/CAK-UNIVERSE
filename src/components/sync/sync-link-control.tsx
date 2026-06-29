"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Link2,
  RefreshCw,
  Trash2,
  FileText,
  Sheet,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
} from "lucide-react";
import type { SyncLink } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

interface SyncLinkControlProps {
  pipelineId: string;
  field?: string;
}

interface ListResponse {
  success: boolean;
  error: string | null;
  data: SyncLink[] | null;
}

/** Link / view / sync / unlink Google Docs & Sheets for one pipeline item. */
export default function SyncLinkControl({ pipelineId, field = "script" }: SyncLinkControlProps) {
  const [links, setLinks] = useState<SyncLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sync/links?pipelineId=${encodeURIComponent(pipelineId)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as ListResponse;
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to load links");
      setLinks(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load links");
    } finally {
      setLoading(false);
    }
  }, [pipelineId]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  async function link() {
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sync/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), pipelineId, field }),
      });
      const json = (await res.json()) as { success: boolean; error: string | null };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Link failed");
      setUrl("");
      await loadLinks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Link failed");
    } finally {
      setBusy(false);
    }
  }

  async function runSync(id: string) {
    setRunningId(id);
    setError(null);
    try {
      const res = await fetch("/api/sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId: id }),
      });
      const json = (await res.json()) as { success: boolean; error: string | null };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Sync failed");
      await loadLinks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setRunningId(null);
    }
  }

  async function unlink(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/sync/links?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = (await res.json()) as { success: boolean; error: string | null };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Unlink failed");
      await loadLinks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unlink failed");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="sync-url" className="sr-only">
          Google Doc or Sheet URL
        </label>
        <input
          id="sync-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void link();
          }}
          placeholder="Paste a Google Doc / Sheet URL"
          className="min-h-[40px] flex-1 rounded-xl border border-border bg-surface-2/60 px-3 text-sm text-fg outline-none transition-colors hover:border-white/20 focus-visible:ring-2 focus-visible:ring-primary/60"
        />
        <button
          type="button"
          onClick={link}
          disabled={busy || !url.trim()}
          className={cn("btn btn-primary text-xs", (busy || !url.trim()) && "cursor-not-allowed opacity-60")}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Link2 className="size-3.5" strokeWidth={1.5} aria-hidden />
          )}
          Link
        </button>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-[11px] text-danger" role="alert">
          <AlertTriangle className="size-3.5" strokeWidth={1.5} aria-hidden />
          {error}
        </p>
      )}

      {loading ? (
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Loading links…
        </span>
      ) : links.length === 0 ? (
        <p className="text-[11px] text-muted">No docs or sheets linked yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {links.map((l) => (
            <LinkRow
              key={l.id}
              link={l}
              running={runningId === l.id}
              onSync={() => runSync(l.id)}
              onUnlink={() => unlink(l.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function LinkRow({
  link,
  running,
  onSync,
  onUnlink,
}: {
  link: SyncLink;
  running: boolean;
  onSync: () => void;
  onUnlink: () => void;
}) {
  const KindIcon = link.kind === "sheet" ? Sheet : FileText;
  return (
    <li className="flex items-center gap-2 rounded-xl border border-border/50 bg-surface-2/40 px-3 py-2">
      <span className="chip border-border/60 bg-surface-2/60 capitalize text-muted">
        <KindIcon className="size-3" strokeWidth={1.5} aria-hidden />
        {link.kind}
      </span>

      <div className="min-w-0 flex-1">
        {link.external_url ? (
          <a
            href={link.external_url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-xs text-fg/80 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            {link.external_url}
          </a>
        ) : (
          <span className="block truncate text-xs text-fg/80">{link.external_id}</span>
        )}
        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted">
          <DirectionBadge direction={link.last_direction} />
          <span>{relativeTime(link.last_synced_at)}</span>
          {link.status === "error" && link.last_error && (
            <span className="truncate text-danger" title={link.last_error}>
              {link.last_error}
            </span>
          )}
        </span>
      </div>

      <button
        type="button"
        onClick={onSync}
        disabled={running}
        aria-label="Sync now"
        title="Sync now"
        className={cn("btn text-xs", running && "cursor-not-allowed opacity-60")}
      >
        {running ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="size-3.5" strokeWidth={1.5} aria-hidden />
        )}
      </button>
      <button
        type="button"
        onClick={onUnlink}
        aria-label="Unlink"
        title="Unlink"
        className="btn text-xs text-danger"
      >
        <Trash2 className="size-3.5" strokeWidth={1.5} aria-hidden />
      </button>
    </li>
  );
}

function DirectionBadge({ direction }: { direction: SyncLink["last_direction"] }) {
  if (direction === "pull") {
    return (
      <span className="flex items-center gap-0.5 text-success">
        <ArrowDownToLine className="size-3" strokeWidth={1.5} aria-hidden />
        pull
      </span>
    );
  }
  if (direction === "push") {
    return (
      <span className="flex items-center gap-0.5 text-primary">
        <ArrowUpFromLine className="size-3" strokeWidth={1.5} aria-hidden />
        push
      </span>
    );
  }
  if (direction === "conflict") {
    return (
      <span className="flex items-center gap-0.5 text-warning">
        <AlertTriangle className="size-3" strokeWidth={1.5} aria-hidden />
        conflict
      </span>
    );
  }
  return <span className="text-muted">idle</span>;
}
