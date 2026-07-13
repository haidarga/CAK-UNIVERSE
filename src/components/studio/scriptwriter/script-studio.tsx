"use client";

import { useState } from "react";
import { Sparkles, FileSpreadsheet, FileText, ClipboardPaste, Loader2, Layers } from "lucide-react";
import GlassCard from "@/components/glass-card";
import TriageBoard from "./triage-board";

interface Persona { id: string; name: string }
interface Batch { id: string; name: string; external_doc_ref: unknown; created_at: string }
interface PreviewBrief { title: string; product?: string | null; platform?: string | null; fields: Record<string, string> }

type Src = "sheet" | "doc" | "paste";

export default function ScriptStudio({ brandId, personas, batches }: { brandId: string; personas: Persona[]; batches: Batch[] }) {
  const [src, setSrc] = useState<Src>("sheet");
  const [sheet, setSheet] = useState("");
  const [doc, setDoc] = useState("");
  const [text, setText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [briefs, setBriefs] = useState<PreviewBrief[] | null>(null);
  const [personaIds, setPersonaIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [localBatches, setLocalBatches] = useState<Batch[]>(batches);
  const [activeBatch, setActiveBatch] = useState<string | null>(null);

  async function api(path: string, init?: RequestInit) {
    const res = await fetch(`/api/scriptwriter/${path}`, init);
    const json = await res.json();
    return { okFlag: res.ok && json.success, data: json.data, error: json.error as string | null };
  }

  async function extract() {
    setExtracting(true); setError(null);
    try {
      const payload = src === "sheet" ? { google_sheet: sheet } : src === "doc" ? { google_doc: doc } : { text };
      const r = await api("briefs/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId, ...payload }) });
      if (!r.okFlag) { setError(r.error || "extraction failed"); return; }
      setBriefs(r.data.briefs || []);
    } catch { setError("network error during extraction"); }
    finally { setExtracting(false); }
  }

  async function importAndGenerate() {
    if (!briefs || briefs.length === 0) return;
    setBusy(true); setError(null); setProgress("Saving briefs…");
    try {
      const label = src === "sheet" ? "Google Sheet" : src === "doc" ? "Google Doc" : `Plan ${new Date().toLocaleDateString("id-ID")}`;
      const c = await api("briefs/import/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId, briefs, import_label: label }) });
      if (!c.okFlag) { setError(c.error || "failed to save briefs"); return; }
      const ids: string[] = c.data.brief_ids;

      setProgress("Creating batch…");
      const b = await api("batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId, name: `${label} ${new Date().toLocaleDateString("id-ID")}` }) });
      if (!b.okFlag) { setError(b.error || "failed to create batch"); return; }
      const batch: Batch = b.data.batch;

      const chosen: (string | null)[] = personaIds.length ? personaIds : [null];
      const items = ids.flatMap((brief_id) => chosen.map((persona_id) => ({ brief_id, persona_id })));
      setProgress(`Queueing ${items.length} naskah…`);
      const g = await api("generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId, batch_id: batch.id, items }) });
      if (!g.okFlag) { setError(g.error || "failed to queue generation"); return; }

      setLocalBatches((prev) => [batch, ...prev]);
      setActiveBatch(batch.id);
      setBriefs(null); setSheet(""); setDoc(""); setText(""); setPersonaIds([]); setProgress(null);
    } catch { setError("network error"); }
    finally { setBusy(false); }
  }

  const fanoutCount = (briefs?.length ?? 0) * (personaIds.length || 1);
  const TABS: { id: Src; label: string; icon: typeof FileSpreadsheet }[] = [
    { id: "sheet", label: "Google Sheet", icon: FileSpreadsheet },
    { id: "doc", label: "Google Doc", icon: FileText },
    { id: "paste", label: "Paste", icon: ClipboardPaste },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
      {/* LEFT: batch triage or a hint */}
      <div className="order-2 xl:order-1">
        {activeBatch ? (
          <TriageBoard key={activeBatch} brandId={brandId} batchId={activeBatch} />
        ) : (
          <GlassCard title="Batches" icon={Layers}>
            {localBatches.length === 0 ? (
              <p className="text-sm text-muted">No batches yet. Import a content plan on the right to generate your first naskah.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {localBatches.map((b) => (
                  <button key={b.id} onClick={() => setActiveBatch(b.id)} className="flex items-center justify-between gap-3 py-3 text-left transition-colors hover:text-primary">
                    <span className="truncate text-sm font-medium text-fg">{b.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted">{new Date(b.created_at).toLocaleDateString("id-ID")}</span>
                  </button>
                ))}
              </div>
            )}
          </GlassCard>
        )}
      </div>

      {/* RIGHT: import + generate */}
      <div className="order-1 flex flex-col gap-4 xl:order-2">
        <GlassCard title="Import content plan" icon={Sparkles} noHover>
          {briefs === null ? (
            <div className="flex flex-col gap-3">
              <div className="flex gap-1 rounded-xl border border-border p-1">
                {TABS.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button key={t.id} onClick={() => setSrc(t.id)} disabled={extracting}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${src === t.id ? "bg-primary/15 text-primary" : "text-muted hover:text-fg"}`}>
                      <Icon className="size-3.5" aria-hidden /> {t.label}
                    </button>
                  );
                })}
              </div>
              {src === "sheet" && <input value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder="Google Sheet URL or id" className="rounded-xl border border-border bg-surface-2/50 px-3 py-2 text-sm text-fg outline-none focus:border-primary" />}
              {src === "doc" && <input value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="Google Doc URL or id" className="rounded-xl border border-border bg-surface-2/50 px-3 py-2 text-sm text-fg outline-none focus:border-primary" />}
              {src === "paste" && <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Paste the content plan…" className="resize-y rounded-xl border border-border bg-surface-2/50 px-3 py-2 text-sm text-fg outline-none focus:border-primary" />}
              <button onClick={extract} disabled={extracting} className="btn btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50">
                {extracting ? <><Loader2 className="size-4 animate-spin" /> Extracting…</> : "Extract briefs"}
              </button>
              <p className="text-[11px] text-muted">Sheet/Doc use your connected Google account. AI splits rows into briefs.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-fg">{briefs.length} briefs found</span>
                <button onClick={() => setBriefs(null)} className="text-[11px] text-muted hover:text-fg">Start over</button>
              </div>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-surface-2/40 p-2">
                {briefs.slice(0, 60).map((b, i) => (
                  <div key={i} className="truncate py-0.5 text-xs text-muted"><span className="text-fg">{b.title}</span></div>
                ))}
                {briefs.length > 60 && <p className="pt-1 text-[11px] text-muted">+{briefs.length - 60} more…</p>}
              </div>
              {personas.length > 0 && (
                <div>
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">Personas (fan-out)</span>
                  <div className="flex flex-wrap gap-1.5">
                    {personas.map((p) => {
                      const on = personaIds.includes(p.id);
                      return (
                        <button key={p.id} onClick={() => setPersonaIds((s) => on ? s.filter((x) => x !== p.id) : [...s, p.id])}
                          className={`rounded-lg border px-2 py-1 text-xs transition-colors ${on ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:text-fg"}`}>{p.name}</button>
                      );
                    })}
                  </div>
                </div>
              )}
              <button onClick={importAndGenerate} disabled={busy} className="btn btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50">
                {busy ? <><Loader2 className="size-4 animate-spin" /> Working…</> : `Import & Generate ${fanoutCount} naskah`}
              </button>
              <p className="text-[11px] text-muted">{personaIds.length ? `${briefs.length} briefs × ${personaIds.length} personas` : "No persona picked → brief's default persona"}</p>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          {progress && <p className="mt-2 text-xs text-muted">{progress}</p>}
        </GlassCard>
      </div>
    </div>
  );
}
