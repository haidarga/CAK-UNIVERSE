"use client";

import { useState } from "react";
import { Search, Loader2, Sparkles, Radar, Wand2 } from "lucide-react";
import GlassCard from "@/components/glass-card";
import SuggestionCards, { type StrategySuggestion } from "./suggestion-cards";
import ResearchCard, {
  type ResearchCardItem,
  type ResearchPlatform,
} from "./research-card";

interface PlatformToggle {
  id: ResearchPlatform;
  label: string;
}

const PLATFORMS: PlatformToggle[] = [
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram" },
  { id: "youtube", label: "YouTube" },
  { id: "sge", label: "SGE" },
];

const PLATFORM_LABEL: Record<ResearchPlatform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  sge: "SGE",
};

interface ResearchResponse {
  topic: string;
  items: ResearchCardItem[];
  errors: Record<string, string>;
  suggestions?: unknown;
}

/** Normalize the assistant's strategy_suggest payload into typed cards. */
function coerceSuggestions(data: unknown): StrategySuggestion[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map((x) => ({
      title: String(x.title ?? "Untitled"),
      emotional_pillar: typeof x.emotional_pillar === "string" ? x.emotional_pillar : undefined,
      format: typeof x.format === "string" ? x.format : undefined,
      hook: typeof x.hook === "string" ? x.hook : undefined,
      narrative_theme: typeof x.narrative_theme === "string" ? x.narrative_theme : undefined,
    }))
    .slice(0, 8);
}

export default function TrendResearch() {
  const [topic, setTopic] = useState("");
  const [active, setActive] = useState<Set<ResearchPlatform>>(
    new Set(PLATFORMS.map((p) => p.id)),
  );
  const [suggest, setSuggest] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ResearchCardItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<StrategySuggestion[]>([]);
  const [searched, setSearched] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  function togglePlatform(id: ResearchPlatform) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runSearch() {
    const q = topic.trim();
    if (!q || loading) return;

    setLoading(true);
    setFetchError(null);
    setItems([]);
    setErrors({});
    setSuggestions([]);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: q,
          platforms: Array.from(active),
          suggest,
        }),
      });
      const json: { success?: boolean; data?: ResearchResponse; error?: string } =
        await res.json();
      if (!res.ok || json.success === false || !json.data) {
        throw new Error(json.error ?? "Gagal mencari tren");
      }
      setItems(json.data.items);
      setErrors(json.data.errors ?? {});
      setSuggestions(coerceSuggestions(json.data.suggestions));
      setSearched(true);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Gagal mencari tren");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runSearch();
  }

  // "Jadikan arah konten" — seed the AI directions section from a single item.
  function useItem(item: ResearchCardItem) {
    setSuggestions((prev) => [
      {
        title: item.title?.slice(0, 80) || `Konten viral ${PLATFORM_LABEL[item.platform]}`,
        format: item.platform === "youtube" ? "long_form" : "short_form",
        hook: item.title,
        narrative_theme: `Adaptasi tren dari ${PLATFORM_LABEL[item.platform]}`,
      },
      ...prev,
    ]);
  }

  const errorEntries = Object.entries(errors);

  return (
    <GlassCard title="Riset tren realtime" icon={Radar} noHover>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <label htmlFor="research-topic" className="sr-only">
              Topik riset tren
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden
              strokeWidth={1.5}
            />
            <input
              id="research-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Topik, mis. skincare lokal, tabungan anak muda…"
              maxLength={200}
              className="bezel w-full rounded-xl bg-surface-2/60 py-2.5 pl-9 pr-3 text-sm text-fg placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !topic.trim()}
            className="btn btn-primary inline-flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden strokeWidth={1.5} />
            ) : (
              <Search className="size-4" aria-hidden strokeWidth={1.5} />
            )}
            Cari Tren
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow text-muted">Platform</span>
          {PLATFORMS.map((p) => {
            const on = active.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePlatform(p.id)}
                aria-pressed={on}
                className={`chip transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                  on
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border bg-surface-2/40 text-muted hover:text-fg"
                }`}
              >
                {p.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setSuggest((s) => !s)}
            aria-pressed={suggest}
            className={`chip ml-auto inline-flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
              suggest
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border bg-surface-2/40 text-muted hover:text-fg"
            }`}
          >
            <Sparkles className="size-3" aria-hidden strokeWidth={1.5} />
            Saranin ide
          </button>
        </div>
      </form>

      {/* States */}
      <div className="mt-5" aria-live="polite">
        {loading && (
          <div className="flex items-center justify-center gap-2.5 py-12 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden strokeWidth={1.5} />
            Menyari tren realtime…
          </div>
        )}

        {!loading && fetchError && (
          <p className="rounded-xl border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-danger">
            {fetchError}
          </p>
        )}

        {!loading && !fetchError && (
          <>
            {/* AI directions */}
            {suggestions.length > 0 && (
              <div className="glass-2 animate-fade-up mb-5 rounded-2xl border border-accent/20 bg-accent/[0.04] p-4">
                <p className="eyebrow mb-3 flex items-center gap-1.5 text-accent">
                  <Wand2 className="size-3.5" aria-hidden strokeWidth={1.5} />
                  Arah konten dari AI — klik untuk pakai
                </p>
                <SuggestionCards suggestions={suggestions} onDrop={() => {}} />
              </div>
            )}

            {/* Per-platform error notes */}
            {errorEntries.length > 0 && (
              <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted/80">
                {errorEntries.map(([platform, msg]) => (
                  <li key={platform}>
                    <span className="font-medium text-muted">
                      {PLATFORM_LABEL[platform as ResearchPlatform] ?? platform}:
                    </span>{" "}
                    {msg}
                  </li>
                ))}
              </ul>
            )}

            {/* Results grid */}
            {items.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((it) => (
                  <ResearchCard key={it.url} item={it} onUse={useItem} />
                ))}
              </div>
            ) : (
              searched && (
                <p className="py-8 text-center text-sm text-muted">
                  Belum ada hasil. Coba topik lain atau aktifkan platform lain
                  {errorEntries.length > 0 ? " (beberapa platform butuh login)." : "."}
                </p>
              )
            )}
          </>
        )}
      </div>
    </GlassCard>
  );
}
