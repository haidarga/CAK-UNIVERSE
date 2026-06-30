"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  Sheet as SheetIcon,
  Loader2,
  RefreshCw,
  ArrowUpFromLine,
  ArrowDownToLine,
  AlertTriangle,
  CheckCircle2,
  Zap,
  ExternalLink,
  FolderOpen,
} from "lucide-react";
import GlassCard from "@/components/glass-card";
import { relativeTime } from "@/lib/utils";

type Kind = "doc" | "sheet";
type Status = "idle" | "loading" | "synced" | "editing" | "pushing" | "pulling" | "conflict" | "error";

const POLL_MS = 20_000; // near-realtime auto-pull
const PUSH_DEBOUNCE_MS = 2500; // auto-push after edits settle
const RECENTS_KEY = "cakai-doc-recents";

/** Small stable FNV-1a hash (mirrors server hashText) for change detection. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** Serialize current content for hashing / pushing. */
function serialize(kind: Kind, docBody: string, grid: string[][]): string {
  return kind === "doc" ? docBody : JSON.stringify(grid);
}

/** Pad a grid to a minimum editable size. */
function padGrid(values: string[][], minRows = 8, minCols = 5): string[][] {
  const rows = Math.max(values.length, minRows);
  const cols = Math.max(minCols, ...values.map((r) => r.length), 1);
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => values[r]?.[c] ?? ""),
  );
}

/** Drop trailing all-empty rows/cols before pushing a sheet. */
function trimGrid(grid: string[][]): string[][] {
  let lastRow = -1;
  let lastCol = -1;
  grid.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell.trim()) {
        if (r > lastRow) lastRow = r;
        if (c > lastCol) lastCol = c;
      }
    }),
  );
  if (lastRow < 0) return [[]];
  return grid.slice(0, lastRow + 1).map((row) => row.slice(0, lastCol + 1));
}

export default function DocSyncWorkspace() {
  const [url, setUrl] = useState("");
  const [loadedUrl, setLoadedUrl] = useState("");
  const [kind, setKind] = useState<Kind | null>(null);
  const [range, setRange] = useState("");
  const [docBody, setDocBody] = useState("");
  const [grid, setGrid] = useState<string[][]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [recents, setRecents] = useState<string[]>([]);

  // Refs for the polling closure (avoid stale state).
  const dirtyRef = useRef(false);
  const syncedHashRef = useRef("");
  const busyRef = useRef(false);
  const kindRef = useRef<Kind | null>(null);
  const rangeRef = useRef("");
  const docRef = useRef("");
  const gridRef = useRef<string[][]>([]);
  const autoRef = useRef(true);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    autoRef.current = auto;
  }, [auto]);
  useEffect(() => {
    docRef.current = docBody;
  }, [docBody]);
  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);

  useEffect(() => {
    try {
      setRecents(JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]"));
    } catch {
      /* ignore */
    }
  }, []);

  function rememberRecent(u: string) {
    setRecents((prev) => {
      const next = [u, ...prev.filter((x) => x !== u)].slice(0, 5);
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  /** Read the remote document. Returns the serialized form + applies to state. */
  const fetchRemote = useCallback(
    async (
      targetUrl: string,
      apply: boolean,
    ): Promise<{ serialized: string } | null> => {
      const res = await fetch("/api/docs/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl, range: rangeRef.current || undefined }),
      });
      const json: {
        success?: boolean;
        error?: string;
        data?: { kind?: Kind; range?: string; body?: string; values?: string[][] };
      } = await res.json();
      if (!res.ok || json.success === false || !json.data) {
        throw new Error(json.error ?? "Gagal baca dokumen");
      }
      const d = json.data;
      const k = (d.kind ?? "doc") as Kind;
      const serialized =
        k === "doc" ? d.body ?? "" : JSON.stringify(padGrid(d.values ?? []));
      if (apply) {
        setKind(k);
        kindRef.current = k;
        if (d.range) {
          setRange(d.range);
          rangeRef.current = d.range;
        }
        if (k === "doc") {
          setDocBody(d.body ?? "");
          docRef.current = d.body ?? "";
        } else {
          const padded = padGrid(d.values ?? []);
          setGrid(padded);
          gridRef.current = padded;
        }
      }
      return { serialized };
    },
    [],
  );

  const open = useCallback(
    async (targetUrl: string) => {
      const u = targetUrl.trim();
      if (!u) return;
      setStatus("loading");
      setError(null);
      setLoadedUrl(u);
      try {
        const r = await fetchRemote(u, true);
        const serialized = r?.serialized ?? "";
        syncedHashRef.current = hash(serialized);
        dirtyRef.current = false;
        setLastSyncedAt(new Date().toISOString());
        setStatus("synced");
        rememberRecent(u);
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : "Gagal buka dokumen");
      }
    },
    [fetchRemote],
  );

  /** Push current local content to the remote. */
  const push = useCallback(async () => {
    if (busyRef.current || !loadedUrl || !kindRef.current) return;
    busyRef.current = true;
    setStatus("pushing");
    try {
      const k = kindRef.current;
      const payload =
        k === "doc"
          ? { url: loadedUrl, body: docRef.current }
          : { url: loadedUrl, values: trimGrid(gridRef.current), range: "A1" };
      const res = await fetch("/api/docs/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json: { success?: boolean; error?: string } = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error ?? "Gagal push");
      syncedHashRef.current = hash(serialize(k, docRef.current, gridRef.current));
      dirtyRef.current = false;
      setLastSyncedAt(new Date().toISOString());
      setStatus("synced");
      setError(null);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Gagal push");
    } finally {
      busyRef.current = false;
    }
  }, [loadedUrl]);

  /** Poll the remote; pull if it changed & we're clean, else flag a conflict. */
  const pull = useCallback(
    async (manual: boolean) => {
      if (busyRef.current || !loadedUrl) return;
      busyRef.current = true;
      if (manual) setStatus("pulling");
      try {
        const r = await fetchRemote(loadedUrl, false);
        const remoteHash = hash(r?.serialized ?? "");
        if (remoteHash === syncedHashRef.current) {
          // remote unchanged since last sync
          if (manual && !dirtyRef.current) setStatus("synced");
        } else if (!dirtyRef.current) {
          // remote moved, we're clean -> adopt remote
          await fetchRemote(loadedUrl, true);
          syncedHashRef.current = remoteHash;
          setLastSyncedAt(new Date().toISOString());
          setStatus("synced");
        } else {
          // both sides changed -> conflict
          setStatus("conflict");
        }
      } catch (e) {
        if (manual) {
          setStatus("error");
          setError(e instanceof Error ? e.message : "Gagal pull");
        }
      } finally {
        busyRef.current = false;
      }
    },
    [loadedUrl, fetchRemote],
  );

  // Auto-pull poll.
  useEffect(() => {
    if (!loadedUrl) return;
    const t = setInterval(() => {
      if (autoRef.current && !busyRef.current) void pull(false);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [loadedUrl, pull]);

  /** Mark dirty + schedule a debounced auto-push. */
  function onLocalEdit() {
    dirtyRef.current = true;
    setStatus((s) => (s === "conflict" ? "conflict" : "editing"));
    if (!autoRef.current) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      if (dirtyRef.current && status !== "conflict") void push();
    }, PUSH_DEBOUNCE_MS);
  }

  function editDoc(v: string) {
    setDocBody(v);
    docRef.current = v;
    onLocalEdit();
  }

  function editCell(r: number, c: number, v: string) {
    setGrid((prev) => {
      const next = prev.map((row) => row.slice());
      next[r][c] = v;
      gridRef.current = next;
      return next;
    });
    onLocalEdit();
  }

  function addRow() {
    setGrid((prev) => {
      const cols = prev[0]?.length ?? 5;
      const next = [...prev.map((r) => r.slice()), Array(cols).fill("")];
      gridRef.current = next;
      return next;
    });
  }
  function addCol() {
    setGrid((prev) => {
      const next = prev.map((r) => [...r, ""]);
      gridRef.current = next;
      return next;
    });
  }

  // Conflict resolution.
  async function keepMine() {
    setStatus("pushing");
    await push();
  }
  async function takeTheirs() {
    dirtyRef.current = false;
    await open(loadedUrl);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* URL bar */}
      <GlassCard noHover>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void open(url);
              }}
              placeholder="Paste link Google Docs / Sheets…"
              className="bezel min-h-[44px] flex-1 rounded-xl bg-surface-2/60 px-3.5 text-sm text-fg placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            />
            <button
              type="button"
              onClick={() => void open(url)}
              disabled={status === "loading" || !url.trim()}
              className="btn btn-primary inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {status === "loading" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden strokeWidth={1.5} />
              ) : (
                <FolderOpen className="size-4" aria-hidden strokeWidth={1.5} />
              )}
              Buka
            </button>
          </div>

          {recents.length > 0 && !loadedUrl && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="eyebrow text-muted">Terakhir</span>
              {recents.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setUrl(r);
                    void open(r);
                  }}
                  className="chip max-w-[220px] truncate border-border bg-surface-2/40 text-[11px] text-muted hover:text-fg"
                  title={r}
                >
                  {r.replace(/^https?:\/\/(www\.)?docs\.google\.com\//, "")}
                </button>
              ))}
            </div>
          )}

          {error && (
            <p className="flex items-center gap-1.5 text-sm text-danger" role="alert">
              <AlertTriangle className="size-4" aria-hidden strokeWidth={1.5} />
              {error}
            </p>
          )}
        </div>
      </GlassCard>

      {/* Document surface */}
      {loadedUrl && kind && (
        <GlassCard
          title={kind === "doc" ? "Google Doc" : "Google Sheet"}
          icon={kind === "doc" ? FileText : SheetIcon}
          noHover
        >
          {/* toolbar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusPill status={status} />
            {lastSyncedAt && (
              <span className="text-[11px] text-muted">sync {relativeTime(lastSyncedAt)}</span>
            )}
            <a
              href={loadedUrl}
              target="_blank"
              rel="noreferrer"
              className="chip border-border bg-surface-2/40 text-[11px] text-muted hover:text-fg"
            >
              <ExternalLink className="size-3" aria-hidden strokeWidth={1.5} /> Buka di Google
            </a>

            <button
              type="button"
              onClick={() => setAuto((a) => !a)}
              aria-pressed={auto}
              className={`chip ml-auto inline-flex items-center gap-1 ${
                auto
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-border bg-surface-2/40 text-muted"
              }`}
              title="Auto-sync near-realtime (pull tiap 20s + push otomatis)"
            >
              <Zap className="size-3" aria-hidden strokeWidth={1.5} />
              {auto ? "Auto-sync ON" : "Auto-sync OFF"}
            </button>
            <button
              type="button"
              onClick={() => void pull(true)}
              className="chip border-border bg-surface-2/40 text-muted hover:text-fg"
              title="Tarik dari Google"
            >
              <ArrowDownToLine className="size-3" aria-hidden strokeWidth={1.5} /> Pull
            </button>
            <button
              type="button"
              onClick={() => void push()}
              className="chip border-border bg-surface-2/40 text-muted hover:text-fg"
              title="Kirim ke Google"
            >
              <ArrowUpFromLine className="size-3" aria-hidden strokeWidth={1.5} /> Push
            </button>
          </div>

          {status === "conflict" && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-3.5 py-2.5 text-sm text-amber-300">
              <AlertTriangle className="size-4 shrink-0" aria-hidden strokeWidth={1.5} />
              <span>Dokumen diubah di Google sementara kamu juga ngedit. Pilih:</span>
              <button
                type="button"
                onClick={() => void keepMine()}
                className="chip border-amber-400/40 bg-amber-400/10 text-amber-200"
              >
                Pakai punyaku (timpa Google)
              </button>
              <button
                type="button"
                onClick={() => void takeTheirs()}
                className="chip border-border bg-surface-2/40 text-muted hover:text-fg"
              >
                Ambil dari Google
              </button>
            </div>
          )}

          {kind === "doc" ? (
            <textarea
              value={docBody}
              onChange={(e) => editDoc(e.target.value)}
              spellCheck
              rows={22}
              className="bezel min-h-[520px] w-full resize-y rounded-xl bg-surface-2/40 p-4 text-sm leading-7 text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              placeholder="Isi dokumen…"
            />
          ) : (
            <SheetGrid grid={grid} onEdit={editCell} onAddRow={addRow} onAddCol={addCol} />
          )}

          <p className="mt-2 text-[11px] text-muted">
            {auto
              ? "Auto-sync ON — pull tiap ~20 detik, push otomatis pas berhenti ngetik. (Google Docs gak ada stream live as-you-type, jadi ini near-realtime.)"
              : "Auto-sync OFF — pakai tombol Pull/Push manual."}
          </p>
        </GlassCard>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string; icon: React.ReactNode }> = {
    idle: { label: "—", cls: "text-muted", icon: null },
    loading: { label: "Loading", cls: "text-muted", icon: <Loader2 className="size-3 animate-spin" /> },
    synced: { label: "Tersinkron", cls: "text-success", icon: <CheckCircle2 className="size-3" /> },
    editing: { label: "Ngedit…", cls: "text-accent", icon: <Zap className="size-3" /> },
    pushing: { label: "Mengirim…", cls: "text-primary", icon: <ArrowUpFromLine className="size-3" /> },
    pulling: { label: "Menarik…", cls: "text-primary", icon: <ArrowDownToLine className="size-3" /> },
    conflict: { label: "Konflik", cls: "text-amber-300", icon: <AlertTriangle className="size-3" /> },
    error: { label: "Error", cls: "text-danger", icon: <AlertTriangle className="size-3" /> },
  };
  const m = map[status];
  return (
    <span className={`chip border-border bg-surface-2/40 ${m.cls}`}>
      {m.icon}
      {m.label}
    </span>
  );
}

function SheetGrid({
  grid,
  onEdit,
  onAddRow,
  onAddCol,
}: {
  grid: string[][];
  onEdit: (r: number, c: number, v: string) => void;
  onAddRow: () => void;
  onAddCol: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {grid.map((row, r) => (
              <tr key={r}>
                <td className="sticky left-0 z-10 border border-border/60 bg-surface-2/80 px-2 py-1 text-center text-[10px] text-muted">
                  {r + 1}
                </td>
                {row.map((cell, c) => (
                  <td key={c} className="border border-border/40 p-0">
                    <input
                      value={cell}
                      onChange={(e) => onEdit(r, c, e.target.value)}
                      className="min-w-[110px] bg-transparent px-2 py-1 text-fg outline-none focus:bg-accent/5 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/50"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAddRow}
          className="chip border-border bg-surface-2/40 text-muted hover:text-fg"
        >
          + Baris
        </button>
        <button
          type="button"
          onClick={onAddCol}
          className="chip border-border bg-surface-2/40 text-muted hover:text-fg"
        >
          + Kolom
        </button>
      </div>
    </div>
  );
}
