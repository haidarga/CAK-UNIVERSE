"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Link2,
  Loader2,
  ExternalLink,
  Trash2,
  FileText,
  Sheet as SheetIcon,
  Pencil,
  ChevronUp,
} from "lucide-react";
import DocSyncWorkspace from "./doc-sync-workspace";

interface Embed {
  id: string;
  provider: string;
  kind: string;
  external_url: string;
  title?: string | null;
}

/** Detect a Google Doc/Sheet from a pasted URL → {kind, provider} or null. */
function detectGoogle(url: string): { kind: "doc" | "sheet"; provider: string } | null {
  if (/docs\.google\.com\/document\//.test(url)) return { kind: "doc", provider: "google_docs" };
  if (/docs\.google\.com\/spreadsheets\//.test(url))
    return { kind: "sheet", provider: "google_sheets" };
  return null;
}

/**
 * Inline doc/sheet panel: paste a Google link → attach → open the FULL document
 * right here to view/edit/sync (no separate tab). Used in Strategy & Script so
 * linking + working on docs happens where the work happens.
 */
export default function DocsPanel({
  brandId,
  pipelineId,
}: {
  brandId: string;
  pipelineId?: string;
}) {
  const [items, setItems] = useState<Embed[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ brandId });
      if (pipelineId) q.set("pipelineId", pipelineId);
      const res = await fetch(`/api/embeds?${q.toString()}`, { cache: "no-store" });
      const json: { data?: Embed[] } = await res.json();
      setItems((json.data ?? []).filter((r) => r.kind === "doc" || r.kind === "sheet"));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [brandId, pipelineId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function attach() {
    const u = url.trim();
    if (!u || busy) return;
    const det = detectGoogle(u);
    if (!det) {
      setError("Cuma link Google Docs / Sheets ya");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/embeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: det.provider,
          kind: det.kind,
          external_url: u,
          brand_id: brandId,
          pipeline_id: pipelineId ?? null,
          title: det.kind === "sheet" ? "Spreadsheet" : "Document",
        }),
      });
      const json: { success?: boolean; error?: string } = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error ?? "Gagal attach");
      setUrl("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal attach");
    } finally {
      setBusy(false);
    }
  }

  async function unlink(id: string) {
    if (openId === id) setOpenId(null);
    await fetch(`/api/embeds?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    await load();
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Attach bar */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void attach();
          }}
          placeholder="Tempel link Google Doc / Sheet…"
          className="bezel min-h-[40px] flex-1 rounded-xl bg-surface-2/60 px-3 text-sm text-fg placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        />
        <button
          type="button"
          onClick={() => void attach()}
          disabled={busy || !url.trim()}
          className="btn btn-primary inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden strokeWidth={1.5} />
          ) : (
            <Link2 className="size-4" aria-hidden strokeWidth={1.5} />
          )}
          Attach
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}

      {/* Linked list */}
      {loading ? (
        <p className="flex items-center gap-2 py-3 text-xs text-muted">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Memuat…
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted">
          Belum ada doc/sheet. Tempel link di atas — langsung bisa diedit & sync di sini.
        </p>
      ) : (
        items.map((it) => {
          const isSheet = it.kind === "sheet";
          const Icon = isSheet ? SheetIcon : FileText;
          const open = openId === it.id;
          return (
            <div key={it.id} className="overflow-hidden rounded-xl border border-border bg-surface-2/40">
              <div className="flex items-center gap-2 px-3 py-2.5">
                <Icon className="size-4 shrink-0 text-muted" aria-hidden strokeWidth={1.5} />
                <span className="min-w-0 flex-1 truncate text-sm text-fg/90" title={it.external_url}>
                  {it.title || (isSheet ? "Spreadsheet" : "Document")}
                </span>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : it.id)}
                  className={`chip ${open ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-surface-2/60 text-muted hover:text-fg"}`}
                >
                  {open ? (
                    <>
                      <ChevronUp className="size-3" aria-hidden strokeWidth={1.5} /> Tutup
                    </>
                  ) : (
                    <>
                      <Pencil className="size-3" aria-hidden strokeWidth={1.5} /> Edit & sync
                    </>
                  )}
                </button>
                <a
                  href={it.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chip border-border bg-surface-2/60 text-muted hover:text-fg"
                  aria-label="Buka di Google"
                >
                  <ExternalLink className="size-3" aria-hidden strokeWidth={1.5} />
                </a>
                <button
                  type="button"
                  onClick={() => void unlink(it.id)}
                  className="chip border-border bg-surface-2/60 text-muted hover:text-danger"
                  aria-label="Lepas link"
                >
                  <Trash2 className="size-3" aria-hidden strokeWidth={1.5} />
                </button>
              </div>
              {open && (
                <div className="border-t border-border/60 bg-bg/30 p-3">
                  <DocSyncWorkspace initialUrl={it.external_url} />
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
