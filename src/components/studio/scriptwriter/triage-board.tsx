"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, X, RefreshCw, Pencil, Save, RotateCcw, Link2, FileUp } from "lucide-react";
import GlassCard from "@/components/glass-card";

interface QueueItem { naskah_id: string; title: string | null; persona_name: string | null; hook_type: string | null; flag_counts: { blocker: number; warning: number; nit: number }; has_open_blockers: boolean }
interface Block { block_id: string; section_key: string; shot_no: number; line_no: number; speaker?: string | null; timestamp_range?: string | null; text: string; visual_note?: string | null }
interface Flag { id: string; target_ref: { block_id: string }; category: string; severity: string; message: string; status: string }
interface Detail { naskah: { id: string; title: string | null }; version: { body: Block[]; hook_justification: string | null } | null; flags: Flag[] }

const SEV: Record<string, string> = { blocker: "text-danger border-danger/40 bg-danger/10", warning: "text-accent border-accent/40 bg-accent/10", nit: "text-muted border-border bg-surface-2/60" };

export default function TriageBoard({ brandId, batchId }: { brandId: string; batchId: string }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [sel, setSel] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [gen, setGen] = useState<{ active: number; done: number; failed: number; total: number } | null>(null);
  const [threshold, setThreshold] = useState<"none" | "blocker_only">("none");
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState<Block[] | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const pumping = useRef(false);
  const cancelled = useRef(false);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`/api/scriptwriter/${path}`, init);
    const json = await res.json();
    return { okFlag: res.ok && json.success, data: json.data, error: json.error as string | null };
  }, []);

  const fetchQueue = useCallback(async () => {
    const r = await api(`triage?brand_id=${brandId}&batch_id=${batchId}`);
    if (r.okFlag) setItems(r.data.items || []);
  }, [api, brandId, batchId]);

  const fetchDetail = useCallback(async (id: string) => {
    const r = await api(`naskah/${id}`);
    if (r.okFlag) setDetail({ naskah: r.data.naskah, version: r.data.version, flags: r.data.flags || [] });
  }, [api]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const currentId = items[sel]?.naskah_id;
  useEffect(() => { setEditing(false); setEdited(null); if (currentId) fetchDetail(currentId); else setDetail(null); }, [currentId, fetchDetail]);

  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true; cancelled.current = false;
    try {
      let stalls = 0;
      for (;;) {
        if (cancelled.current) return;
        const r = await api("gen-jobs/process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch_id: batchId }) });
        if (!r.okFlag) { setMsg(r.error || "generation error"); break; }
        await fetchQueue();
        const st = await api(`gen-jobs/status?batch_id=${batchId}`);
        if (st.okFlag) setGen(st.data);
        const remaining = st.okFlag ? st.data.active : r.data.remaining;
        if (remaining === 0) break;
        if (r.data.claimed === 0) { if (++stalls >= 6) break; await new Promise((x) => setTimeout(x, 2000)); } else stalls = 0;
      }
    } finally {
      pumping.current = false;
      if (!cancelled.current) { const st = await api(`gen-jobs/status?batch_id=${batchId}`); if (st.okFlag) setGen(st.data); fetchQueue(); }
    }
  }, [api, batchId, fetchQueue]);

  useEffect(() => () => { cancelled.current = true; }, []);
  useEffect(() => {
    let stop = false;
    api(`gen-jobs/status?batch_id=${batchId}`).then((st) => { if (stop || !st.okFlag) return; if (st.data.total > 0) setGen(st.data); if (st.data.active > 0) pump(); });
    return () => { stop = true; };
  }, [api, batchId, pump]);

  async function decide(id: string, status: "approved" | "rejected") { await api(`naskah/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); fetchQueue(); }
  async function bulk() { await api("triage/bulk-approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId, batch_id: batchId, threshold }) }); fetchQueue(); }
  async function flagAction(id: string, status: string) { await api(`qc-flags/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); if (currentId) fetchDetail(currentId); }
  async function saveEdit() {
    if (!detail || !edited) return;
    const r = await api(`naskah/${detail.naskah.id}/versions`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: edited, change_summary: "writer edit" }) });
    if (r.okFlag) { await fetchDetail(detail.naskah.id); setEditing(false); setEdited(null); fetchQueue(); } else setMsg(r.error);
  }
  async function linkDoc() {
    if (!linkUrl.trim()) return;
    if (!confirm("Linking means Push OVERWRITES this doc with the batch's naskah. Continue?")) return;
    const r = await api("google-doc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch_id: batchId, action: "link", google_doc: linkUrl }) });
    setMsg(r.okFlag ? "Linked. Push writes into this doc." : r.error); if (r.okFlag) { setLinkOpen(false); setLinkUrl(""); }
  }
  async function pushDoc() { const r = await api("google-doc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch_id: batchId, action: "push" }) }); setMsg(r.okFlag ? `Pushed ${r.data.naskah_count} naskah to Doc.` : r.error); }

  const flagsByBlock = new Map<string, Flag[]>();
  for (const f of detail?.flags ?? []) { if (f.status !== "open") continue; const l = flagsByBlock.get(f.target_ref.block_id) ?? []; l.push(f); flagsByBlock.set(f.target_ref.block_id, l); }
  const blocks = editing ? (edited ?? []) : (detail?.version?.body ?? []);

  return (
    <GlassCard title="Triage queue" icon={RefreshCw} noHover action={
      <div className="flex items-center gap-2">
        <select value={threshold} onChange={(e) => setThreshold(e.target.value as "none" | "blocker_only")} className="rounded-lg border border-border bg-surface-2/50 px-2 py-1 text-[11px] text-fg outline-none">
          <option value="none">Strict: zero flags</option><option value="blocker_only">Loose: no blockers</option>
        </select>
        <button onClick={bulk} className="btn text-[11px]">Bulk approve</button>
        <button onClick={() => setLinkOpen((o) => !o)} className="btn text-[11px]"><Link2 className="size-3.5" /> Link</button>
        <button onClick={pushDoc} className="btn text-[11px]"><FileUp className="size-3.5" /> Push</button>
        <button onClick={fetchQueue} aria-label="Refresh" className="btn-icon"><RefreshCw className="size-4" /></button>
      </div>
    }>
      {gen && gen.total > 0 && (gen.active > 0 || gen.failed > 0) && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-muted">
          {gen.active > 0 && <RefreshCw className="size-3.5 animate-spin text-primary" />}
          <span>Generating {gen.done}/{gen.total}{gen.failed > 0 ? ` · ${gen.failed} failed` : ""}{gen.active > 0 ? ` · ${gen.active} left` : " · done"}</span>
        </div>
      )}
      {linkOpen && (
        <div className="mb-3 flex items-center gap-2">
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Existing Google Doc URL" className="flex-1 rounded-lg border border-border bg-surface-2/50 px-2 py-1.5 text-xs text-fg outline-none focus:border-primary" />
          <button onClick={linkDoc} className="btn btn-primary text-[11px]">Link</button>
        </div>
      )}
      {msg && <p className="mb-3 text-[11px] text-muted">{msg}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-border">
          {items.length === 0 ? <p className="p-4 text-sm text-muted">Nothing in the queue yet.</p> : items.map((it, i) => (
            <button key={it.naskah_id} onClick={() => setSel(i)} className={`block w-full border-b border-border px-3 py-2.5 text-left transition-colors ${i === sel ? "bg-primary/10" : "hover:bg-surface-2/50"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-fg">{it.title || "Untitled"}</span>
                {it.flag_counts.blocker + it.flag_counts.warning === 0 && <Check className="size-3.5 shrink-0 text-primary" />}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {it.persona_name && <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] text-accent">{it.persona_name}</span>}
                {it.flag_counts.blocker > 0 && <span className="rounded border border-danger/40 bg-danger/10 px-1.5 py-0.5 font-mono text-[10px] text-danger">{it.flag_counts.blocker} blocker</span>}
                {it.flag_counts.warning > 0 && <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] text-accent">{it.flag_counts.warning} warn</span>}
              </div>
            </button>
          ))}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {!detail ? <p className="text-sm text-muted">Select a naskah.</p> : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate font-display text-lg font-semibold text-fg">{detail.naskah.title || "Untitled"}</h3>
                <div className="flex shrink-0 gap-1.5">
                  {!editing ? (
                    <>
                      <button onClick={() => { setEdited(detail.version?.body.map((b) => ({ ...b })) ?? []); setEditing(true); }} className="btn text-[11px]"><Pencil className="size-3.5" /> Edit</button>
                      <button onClick={() => decide(detail.naskah.id, "rejected")} className="btn text-[11px] text-danger"><X className="size-3.5" /> Reject</button>
                      <button onClick={() => decide(detail.naskah.id, "approved")} className="btn btn-primary text-[11px]"><Check className="size-3.5" /> Approve</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditing(false); setEdited(null); }} className="btn text-[11px]"><RotateCcw className="size-3.5" /> Cancel</button>
                      <button onClick={saveEdit} className="btn btn-primary text-[11px]"><Save className="size-3.5" /> Save version</button>
                    </>
                  )}
                </div>
              </div>
              {!editing && detail.version?.hook_justification && <p className="rounded-lg bg-surface-2/50 px-3 py-2 text-xs italic text-muted">{detail.version.hook_justification}</p>}
              <div className="flex flex-col gap-2.5">
                {blocks.map((block) => (
                  <div key={block.block_id} className="rounded-xl border border-border bg-surface-2/30 p-3">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{block.section_key} · shot {block.shot_no} · line {block.line_no}</div>
                    {!editing ? (
                      <p className="mt-1.5 text-[15px] leading-relaxed text-fg">{block.speaker && <span className="font-semibold text-primary">{block.speaker}: </span>}{block.text}</p>
                    ) : (
                      <textarea value={block.text} onChange={(e) => setEdited((prev) => prev?.map((b) => b.block_id === block.block_id ? { ...b, text: e.target.value } : b) ?? null)} rows={2}
                        className="mt-1.5 w-full resize-y rounded-lg border border-border bg-surface-2/50 px-2 py-1.5 text-sm text-fg outline-none focus:border-primary" />
                    )}
                    {!editing && (flagsByBlock.get(block.block_id) ?? []).map((f) => (
                      <div key={f.id} className={`mt-2 flex items-start justify-between gap-2 rounded-lg border px-2 py-1.5 text-xs ${SEV[f.severity]}`}>
                        <span><span className="font-semibold uppercase">{f.severity}</span> · {f.category.replace(/_/g, " ")} — {f.message}</span>
                        <div className="flex shrink-0 gap-1.5">
                          <button onClick={() => flagAction(f.id, "resolved")} className="hover:underline">Resolve</button>
                          <button onClick={() => flagAction(f.id, "dismissed")} className="hover:underline">Dismiss</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
