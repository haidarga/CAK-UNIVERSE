"use client";

import { useState } from "react";
import {
  Building2,
  Plus,
  Loader2,
  Save,
  Trash2,
  Sparkles,
  FileText,
  ChevronDown,
} from "lucide-react";
import type { Brand } from "@/lib/types";
import GlassCard from "@/components/glass-card";
import BrandForm, {
  type BrandDraft,
  EMPTY_DRAFT,
  brandToDraft,
  draftToPayload,
} from "./brand-form";

const ARRAY_KEYS = [
  "emotional_pillars",
  "content_formats",
  "guardrails",
  "approved_claims",
  "hashtag_sets",
  "products",
  "hero_products",
] as const;

/** Coerce the AI brand_extract profile into a draft patch (non-empty only). */
function profileToPatch(p: unknown): Partial<BrandDraft> {
  if (!p || typeof p !== "object") return {};
  const o = p as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const patch: Partial<BrandDraft> = {};
  if (str(o.name)) patch.name = str(o.name);
  if (o.platform === "tiktok" || o.platform === "instagram" || o.platform === "both")
    patch.platform = o.platform;
  if (str(o.campaign_tagline)) patch.campaign_tagline = str(o.campaign_tagline);
  if (str(o.guidelines)) patch.guidelines = str(o.guidelines);
  if (str(o.script_format)) patch.script_format = str(o.script_format);
  if (str(o.cta_rules)) patch.cta_rules = str(o.cta_rules);
  for (const k of ARRAY_KEYS) {
    const a = arr(o[k]);
    if (a.length) patch[k] = a;
  }
  return patch;
}

export default function BrandManager({ initialBrands }: { initialBrands: Brand[] }) {
  const [brands, setBrands] = useState<Brand[]>(initialBrands);
  const [draft, setDraft] = useState<BrandDraft>(
    initialBrands[0] ? brandToDraft(initialBrands[0]) : EMPTY_DRAFT,
  );
  const isNew = !draft.id;

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // AI-extract panel
  const [extractOpen, setExtractOpen] = useState(initialBrands.length === 0);
  const [extractUrl, setExtractUrl] = useState("");
  const [extractText, setExtractText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  function patch(p: Partial<BrandDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function selectBrand(b: Brand) {
    setDraft(brandToDraft(b));
    setError(null);
    setSavedFlash(false);
  }

  function newBrand() {
    setDraft(EMPTY_DRAFT);
    setError(null);
    setSavedFlash(false);
    setExtractOpen(true);
  }

  async function save() {
    if (!draft.name.trim()) {
      setError("Nama brand wajib diisi");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = draftToPayload(draft);
      const res = await fetch(isNew ? "/api/brands" : `/api/brands/${draft.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json: { success?: boolean; data?: Brand; error?: string } = await res.json();
      if (!res.ok || json.success === false || !json.data) {
        throw new Error(json.error ?? "Gagal menyimpan brand");
      }
      const saved = json.data;
      setBrands((prev) => {
        const exists = prev.some((b) => b.id === saved.id);
        const next = exists ? prev.map((b) => (b.id === saved.id ? saved : b)) : [...prev, saved];
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
      setDraft(brandToDraft(saved));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan brand");
    } finally {
      setSaving(false);
    }
  }

  async function removeBrand() {
    if (isNew || !draft.id) return;
    if (!confirm(`Hapus brand "${draft.name}"? Gak bisa di-undo.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/brands/${draft.id}`, { method: "DELETE" });
      const json: { success?: boolean; error?: string } = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error ?? "Gagal menghapus");
      const remaining = brands.filter((b) => b.id !== draft.id);
      setBrands(remaining);
      setDraft(remaining[0] ? brandToDraft(remaining[0]) : EMPTY_DRAFT);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus brand");
    } finally {
      setDeleting(false);
    }
  }

  async function runExtract() {
    if (!extractUrl.trim() && !extractText.trim()) {
      setExtractError("Kasih link Google Doc atau paste teks brief dulu");
      return;
    }
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch("/api/brands/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: extractUrl.trim(), text: extractText.trim() }),
      });
      const json: { success?: boolean; data?: { profile?: unknown }; error?: string } =
        await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error ?? "Gagal extract");
      const p = profileToPatch(json.data?.profile);
      if (Object.keys(p).length === 0) throw new Error("AI gak nemu info brand di brief itu");
      patch(p);
      setExtractOpen(false);
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "Gagal extract brand");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
      {/* --- Brand list --- */}
      <aside className="flex flex-col gap-2">
        <button
          type="button"
          onClick={newBrand}
          className="btn btn-primary inline-flex items-center justify-center gap-1.5"
        >
          <Plus className="size-4" aria-hidden strokeWidth={1.5} />
          Brand baru
        </button>
        <div className="flex flex-col gap-1">
          {brands.length === 0 ? (
            <p className="px-1 py-3 text-xs text-muted">Belum ada brand. Bikin yang pertama →</p>
          ) : (
            brands.map((b) => {
              const active = b.id === draft.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => selectBrand(b)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                    active
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-border bg-surface-2/40 text-fg/80 hover:text-fg"
                  }`}
                >
                  <Building2 className="size-3.5 shrink-0" aria-hidden strokeWidth={1.5} />
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted">
                    {b.platform}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* --- Editor --- */}
      <GlassCard
        title={isNew ? "Brand baru" : draft.name || "Edit brand"}
        icon={Building2}
        noHover
      >
        {/* AI extract */}
        <div className="mb-5 rounded-2xl border border-accent/20 bg-accent/[0.04] p-4">
          <button
            type="button"
            onClick={() => setExtractOpen((o) => !o)}
            className="flex w-full items-center gap-2 text-left"
          >
            <Sparkles className="size-4 text-accent" aria-hidden strokeWidth={1.5} />
            <span className="text-sm font-semibold text-accent">
              Isi otomatis dari brand brief (AI)
            </span>
            <ChevronDown
              className={`ml-auto size-4 text-muted transition-transform ${extractOpen ? "rotate-180" : ""}`}
              aria-hidden
              strokeWidth={1.5}
            />
          </button>

          {extractOpen && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex items-center gap-2 rounded-xl bg-surface-2/60 px-3 py-2">
                <FileText className="size-4 shrink-0 text-muted" aria-hidden strokeWidth={1.5} />
                <input
                  className="w-full bg-transparent text-sm text-fg placeholder:text-muted focus:outline-none"
                  value={extractUrl}
                  onChange={(e) => setExtractUrl(e.target.value)}
                  placeholder="Link Google Doc brand brief…"
                />
              </div>
              <p className="text-center text-[11px] text-muted">— atau —</p>
              <textarea
                className="bezel min-h-[80px] w-full resize-y rounded-xl bg-surface-2/60 px-3 py-2 text-sm text-fg placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                value={extractText}
                onChange={(e) => setExtractText(e.target.value)}
                placeholder="…atau paste teks brief brand di sini (nama, produk, tone, pillars, dll)"
              />
              {extractError && <p className="text-xs text-danger">{extractError}</p>}
              <button
                type="button"
                onClick={runExtract}
                disabled={extracting}
                className="btn btn-primary inline-flex items-center justify-center gap-1.5 self-start disabled:opacity-50"
              >
                {extracting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden strokeWidth={1.5} />
                ) : (
                  <Sparkles className="size-4" aria-hidden strokeWidth={1.5} />
                )}
                Extract jadi profil
              </button>
              <p className="text-[11px] text-muted">
                AI ngisi form di bawah — kamu tinggal review & simpan.
              </p>
            </div>
          )}
        </div>

        <BrandForm draft={draft} onChange={patch} />

        {error && (
          <p className="mt-4 rounded-xl border border-danger/30 bg-danger/[0.06] px-4 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center gap-2 border-t border-border/60 pt-4">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="btn btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden strokeWidth={1.5} />
            ) : (
              <Save className="size-4" aria-hidden strokeWidth={1.5} />
            )}
            {isNew ? "Simpan brand" : "Simpan perubahan"}
          </button>
          {savedFlash && <span className="text-sm text-success">✓ Tersimpan</span>}
          {!isNew && (
            <button
              type="button"
              onClick={removeBrand}
              disabled={deleting}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-danger/30 px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden strokeWidth={1.5} />
              ) : (
                <Trash2 className="size-4" aria-hidden strokeWidth={1.5} />
              )}
              Hapus
            </button>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
