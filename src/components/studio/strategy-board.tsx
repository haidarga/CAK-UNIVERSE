"use client";

import { useState } from "react";
import { TrendingUp, CalendarDays, Wand2, FileSpreadsheet } from "lucide-react";
import type { Brand, Trend, EmbeddedResource, ContentPipeline } from "@/lib/types";
import GlassCard from "@/components/glass-card";
import AiAssistInline from "@/components/ai-assist-inline";
import DocsPanel from "@/components/docs/docs-panel";
import EmptyState from "@/components/empty-state";
import TrendCard from "./trend-card";
import CalendarGrid, { type CalendarSlot } from "./calendar-grid";
import SuggestionCards, { type StrategySuggestion } from "./suggestion-cards";

interface StrategyBoardProps {
  brand: Brand;
  trends: Trend[];
  embeds: EmbeddedResource[];
  recent: ContentPipeline[];
}

let slotSeq = 0;
function nextId(): string {
  slotSeq += 1;
  return `slot-${Date.now()}-${slotSeq}`;
}

/** Build strategy_suggest context from brand pillars, tagline, and top trends. */
function buildStrategyContext(brand: Brand, trends: Trend[]): string {
  const top = trends
    .slice(0, 5)
    .map((t) => `- ${t.emotional_angle ?? t.hook_pattern ?? "trend"} (${t.platform})`)
    .join("\n");
  return [
    `Brand: ${brand.name}`,
    brand.campaign_tagline ? `Tagline: ${brand.campaign_tagline}` : "",
    brand.emotional_pillars.length ? `Pillars: ${brand.emotional_pillars.join(", ")}` : "",
    brand.content_formats.length ? `Formats: ${brand.content_formats.join(", ")}` : "",
    top ? `Top trends:\n${top}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

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

export default function StrategyBoard({ brand, trends, recent }: StrategyBoardProps) {
  const pillars = brand.emotional_pillars.length ? brand.emotional_pillars : ["general"];
  const defaultFormat = brand.content_formats[0] ?? "talking_head";

  const [slots, setSlots] = useState<CalendarSlot[]>([]);
  const [suggestions, setSuggestions] = useState<StrategySuggestion[]>([]);

  function addSlot(week: number, seed?: Partial<CalendarSlot>) {
    setSlots((prev) => [
      ...prev,
      {
        id: nextId(),
        week,
        title: seed?.title ?? "",
        pillar: seed?.pillar ?? pillars[0],
        format: seed?.format ?? defaultFormat,
        hook: seed?.hook,
        narrative_theme: seed?.narrative_theme,
        state: "draft",
      },
    ]);
  }

  function removeSlot(id: string) {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  }

  function dropSuggestion(s: StrategySuggestion) {
    addSlot(1, {
      title: s.title,
      pillar: s.emotional_pillar ?? pillars[0],
      format: s.format ?? defaultFormat,
      hook: s.hook,
      narrative_theme: s.narrative_theme,
    });
  }

  function useTrend(t: Trend) {
    addSlot(1, {
      title: t.emotional_angle ?? t.hook_pattern ?? "Trend-based direction",
      pillar: pillars[0],
      format: t.format_type ?? defaultFormat,
      hook: t.hook_pattern ?? undefined,
    });
  }

  function setState(id: string, state: CalendarSlot["state"]) {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, state } : s)));
  }

  async function pushSlot(id: string) {
    const slot = slots.find((s) => s.id === id);
    if (!slot) return;
    setState(id, "pushing");
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: brand.id,
          content_direction: {
            title: slot.title || "Untitled direction",
            format: slot.format,
            emotional_pillar: slot.pillar,
            hook: slot.hook,
            narrative_theme: slot.narrative_theme,
            week_number: slot.week,
          },
          content_type: "direction",
          emotional_pillar: slot.pillar,
          content_format: slot.format,
        }),
      });
      const json: { success?: boolean } = await res.json();
      if (!res.ok || json.success === false) throw new Error("push failed");
      setState(id, "pushed");
    } catch {
      setState(id, "error");
    }
  }

  const ctx = buildStrategyContext(brand, trends);

  return (
    <div className="flex flex-col gap-5">
      {/* Calendar builder */}
      <GlassCard
        title="Content calendar"
        icon={CalendarDays}
        noHover
        action={
          <AiAssistInline
            tool="strategy_suggest"
            getInput={() => `Plan a 4-week content calendar for ${brand.name}.`}
            context={ctx}
            label="Suggest directions"
            onResult={(r) => setSuggestions(coerceSuggestions(r.data ?? r.text))}
          />
        }
      >
        {suggestions.length > 0 && (
          <div className="glass-2 animate-fade-up mb-5 rounded-2xl border border-accent/20 bg-accent/[0.04] p-4 shadow-[0_0_0_1px_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.25)]">
            <p className="eyebrow mb-3 flex items-center gap-1.5 text-accent">
              <Wand2 className="size-3.5" aria-hidden strokeWidth={1.5} />
              AI directions — click to drop into the calendar
            </p>
            <SuggestionCards suggestions={suggestions} onDrop={dropSuggestion} />
          </div>
        )}
        <CalendarGrid slots={slots} onAdd={addSlot} onRemove={removeSlot} onPush={pushSlot} />
      </GlassCard>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Trend board */}
        <div className="xl:col-span-2">
          <GlassCard title="Trend board" icon={TrendingUp} noHover>
            {trends.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="No trends yet"
                hint="Trends appear here once the trend scraper runs for this brand."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {trends.map((t) => (
                  <TrendCard key={t.id} trend={t} onUse={useTrend} />
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Execution sheets + recent */}
        <div className="flex flex-col gap-5">
          <GlassCard title="Docs & sheets" icon={FileSpreadsheet} noHover>
            <DocsPanel brandId={brand.id} />
          </GlassCard>

          {recent.length > 0 && (
            <GlassCard title="Recent in pipeline" noHover>
              <ul className="flex flex-col gap-1">
                {recent.slice(0, 8).map((it) => (
                  <li
                    key={it.id}
                    className="group flex items-center gap-2.5 truncate rounded-xl border border-transparent px-3 py-2.5 text-sm text-fg/80 transition-colors hover:border-border/60 hover:bg-surface-2/50 hover:text-fg"
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-primary/40 transition-colors group-hover:bg-primary"
                      aria-hidden
                    />
                    <span className="truncate">
                      {it.content_direction?.title ?? "Untitled direction"}
                    </span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
