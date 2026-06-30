"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlaskConical,
  Loader2,
  Sparkles,
  TrendingUp,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Rocket,
  BookOpen,
} from "lucide-react";
import GlassCard from "@/components/glass-card";

interface SGEArticle {
  title: string;
  url: string;
  excerpt?: string;
  category?: string;
  source: "pro" | "public";
}

interface Verdict {
  score?: number;
  verdict?: string;
  strengths?: string[];
  risks?: string[];
  how_to_viral?: string[];
  citations?: string[];
}

/** Detail shape for the cross-component "check this plan" event. */
export interface ViralCheckRequest {
  title: string;
  hook?: string;
  format?: string;
  theme?: string;
  notes?: string;
}

const VIRAL_CHECK_EVENT = "sge-viral-check";

function coerceVerdict(data: unknown): Verdict | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    score: typeof d.score === "number" ? d.score : undefined,
    verdict: typeof d.verdict === "string" ? d.verdict : undefined,
    strengths: arr(d.strengths),
    risks: arr(d.risks),
    how_to_viral: arr(d.how_to_viral),
    citations: arr(d.citations),
  };
}

function scoreTone(score?: number): { ring: string; text: string; label: string } {
  if (score == null) return { ring: "border-border", text: "text-muted", label: "—" };
  if (score >= 7) return { ring: "border-success/50", text: "text-success", label: "Kuat" };
  if (score >= 4) return { ring: "border-amber-400/50", text: "text-amber-400", label: "Sedang" };
  return { ring: "border-danger/50", text: "text-danger", label: "Lemah" };
}

export default function SGEViralLab() {
  const [title, setTitle] = useState("");
  const [hook, setHook] = useState("");
  const [format, setFormat] = useState("");
  const extra = useRef<{ theme?: string; notes?: string }>({});

  const [checking, setChecking] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [sourcesUsed, setSourcesUsed] = useState<number | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const [articles, setArticles] = useState<SGEArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);

  const rootRef = useRef<HTMLDivElement>(null);

  // --- highlights feed ---
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/sge/highlights");
        const json: { success?: boolean; data?: { articles?: SGEArticle[] } } = await res.json();
        if (alive) setArticles(json.data?.articles ?? []);
      } catch {
        if (alive) setArticles([]);
      } finally {
        if (alive) setLoadingArticles(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const runCheck = useCallback(async (req: ViralCheckRequest) => {
    if (!req.title.trim()) return;
    setChecking(true);
    setCheckError(null);
    setVerdict(null);
    setSourcesUsed(null);
    try {
      const res = await fetch("/api/sge/viral-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      const json: { success?: boolean; data?: { verdict?: unknown; sourcesUsed?: number }; error?: string } =
        await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error ?? "Gagal cek viral");
      const v = coerceVerdict(json.data?.verdict);
      if (!v) throw new Error("Respon AI tidak terbaca");
      setVerdict(v);
      setSourcesUsed(json.data?.sourcesUsed ?? null);
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : "Gagal cek viral");
    } finally {
      setChecking(false);
    }
  }, []);

  // --- listen for "check this content plan" from elsewhere (plan cards) ---
  useEffect(() => {
    function onRequest(e: Event) {
      const d = (e as CustomEvent<ViralCheckRequest>).detail;
      if (!d?.title) return;
      setTitle(d.title);
      setHook(d.hook ?? "");
      setFormat(d.format ?? "");
      extra.current = { theme: d.theme, notes: d.notes };
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      void runCheck(d);
    }
    window.addEventListener(VIRAL_CHECK_EVENT, onRequest);
    return () => window.removeEventListener(VIRAL_CHECK_EVENT, onRequest);
  }, [runCheck]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runCheck({ title, hook, format, ...extra.current });
  }

  const tone = scoreTone(verdict?.score);

  return (
    <div ref={rootRef}>
      <GlassCard title="SGE Viral Lab" icon={FlaskConical} noHover>
        <p className="mb-4 text-xs text-muted">
          Cek potensi viral ide kontenmu pakai insight asli{" "}
          <span className="text-fg/80">Social Growth Engineers</span> — plus highlight artikel
          terbaru buat nyolong angle.
        </p>

        {/* --- Viral Check --- */}
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ide / judul konten — mis. 'Review skincare lokal pakai hook before-after'"
            maxLength={200}
            className="bezel w-full rounded-xl bg-surface-2/60 px-3 py-2.5 text-sm text-fg placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              placeholder="Hook (opsional)"
              maxLength={160}
              className="bezel flex-1 rounded-xl bg-surface-2/60 px-3 py-2 text-sm text-fg placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            />
            <input
              type="text"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              placeholder="Format (opsional)"
              maxLength={80}
              className="bezel rounded-xl bg-surface-2/60 px-3 py-2 text-sm text-fg placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 sm:w-48"
            />
            <button
              type="submit"
              disabled={checking || !title.trim()}
              className="btn btn-primary inline-flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checking ? (
                <Loader2 className="size-4 animate-spin" aria-hidden strokeWidth={1.5} />
              ) : (
                <Rocket className="size-4" aria-hidden strokeWidth={1.5} />
              )}
              Cek viral
            </button>
          </div>
        </form>

        {/* --- Verdict --- */}
        <div className="mt-4" aria-live="polite">
          {checking && (
            <div className="flex items-center justify-center gap-2.5 py-8 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden strokeWidth={1.5} />
              Nimbang potensi viral pakai insight SGE…
            </div>
          )}

          {!checking && checkError && (
            <p className="rounded-xl border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-danger">
              {checkError}
            </p>
          )}

          {!checking && verdict && (
            <div className="glass-2 animate-fade-up rounded-2xl border border-accent/20 bg-accent/[0.04] p-4">
              <div className="flex items-start gap-4">
                <div
                  className={`flex size-16 shrink-0 flex-col items-center justify-center rounded-2xl border-2 ${tone.ring}`}
                >
                  <span className={`tnum text-2xl font-bold leading-none ${tone.text}`}>
                    {verdict.score ?? "—"}
                  </span>
                  <span className="text-[9px] uppercase tracking-widest text-muted">/10</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`eyebrow ${tone.text}`}>Potensi viral · {tone.label}</p>
                  {verdict.verdict && (
                    <p className="mt-1 text-sm font-medium leading-snug text-fg">{verdict.verdict}</p>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {verdict.strengths && verdict.strengths.length > 0 && (
                  <Section icon={CheckCircle2} tone="text-success" title="Kekuatan" items={verdict.strengths} />
                )}
                {verdict.risks && verdict.risks.length > 0 && (
                  <Section icon={AlertTriangle} tone="text-amber-400" title="Risiko" items={verdict.risks} />
                )}
              </div>

              {verdict.how_to_viral && verdict.how_to_viral.length > 0 && (
                <div className="mt-4">
                  <p className="eyebrow mb-2 flex items-center gap-1.5 text-accent">
                    <Rocket className="size-3.5" aria-hidden strokeWidth={1.5} />
                    How to viral
                  </p>
                  <ol className="flex flex-col gap-1.5">
                    {verdict.how_to_viral.map((step, i) => (
                      <li key={i} className="flex gap-2 text-sm text-fg/90">
                        <span className="tnum mt-0.5 shrink-0 text-xs font-semibold text-accent">
                          {i + 1}.
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {verdict.citations && verdict.citations.length > 0 && (
                <div className="mt-4 border-t border-border/60 pt-3">
                  <p className="eyebrow mb-1.5 text-muted">Acuan SGE</p>
                  <div className="flex flex-wrap gap-1.5">
                    {verdict.citations.map((c, i) => (
                      <span
                        key={i}
                        className="chip border-border bg-surface-2/60 text-[11px] text-muted"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {sourcesUsed === 0 && (
                <p className="mt-3 text-[11px] text-amber-400/90">
                  ⚠️ Knowledge SGE kosong (Chrome CDP mungkin mati) — verdict dari prinsip umum, belum
                  grounded ke artikel.
                </p>
              )}
            </div>
          )}
        </div>

        {/* --- Highlights --- */}
        <div className="mt-6">
          <p className="eyebrow mb-3 flex items-center gap-1.5 text-muted">
            <TrendingUp className="size-3.5" aria-hidden strokeWidth={1.5} />
            Highlight artikel SGE
          </p>

          {loadingArticles ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden strokeWidth={1.5} />
              Narik artikel terbaru…
            </div>
          ) : articles.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface-2/40 px-4 py-3 text-sm text-muted">
              Belum ada artikel — pastiin Chrome CDP nyala (jalankan START.cmd).
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {articles.map((a) => (
                <a
                  key={a.url}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass glass-hover group flex flex-col gap-1.5 p-3.5"
                >
                  <div className="flex items-center gap-2">
                    {a.source === "pro" && (
                      <span className="chip border-accent/30 bg-accent/10 text-[10px] text-accent">
                        <BookOpen className="size-2.5" aria-hidden strokeWidth={1.5} /> Pro
                      </span>
                    )}
                    {a.category && (
                      <span className="text-[10px] uppercase tracking-wider text-muted">
                        {a.category}
                      </span>
                    )}
                    <ExternalLink
                      className="ml-auto size-3 text-muted opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                      strokeWidth={1.5}
                    />
                  </div>
                  <p className="line-clamp-2 text-sm font-medium leading-snug text-fg">{a.title}</p>
                  {a.excerpt && <p className="line-clamp-2 text-xs text-muted">{a.excerpt}</p>}
                </a>
              ))}
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

function Section({
  icon: Icon,
  tone,
  title,
  items,
}: {
  icon: typeof CheckCircle2;
  tone: string;
  title: string;
  items: string[];
}) {
  return (
    <div>
      <p className={`eyebrow mb-1.5 flex items-center gap-1.5 ${tone}`}>
        <Icon className="size-3.5" aria-hidden strokeWidth={1.5} />
        {title}
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-1.5 text-xs text-fg/80">
            <span className={`mt-1 size-1 shrink-0 rounded-full ${tone.replace("text-", "bg-")}`} />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Fire a viral-check request from anywhere (e.g. a content-plan card). */
export function requestViralCheck(req: ViralCheckRequest) {
  window.dispatchEvent(new CustomEvent<ViralCheckRequest>(VIRAL_CHECK_EVENT, { detail: req }));
}
