"use client";

import { Sparkles, ArrowDownToLine } from "lucide-react";

export interface StrategySuggestion {
  title: string;
  emotional_pillar?: string;
  format?: string;
  hook?: string;
  narrative_theme?: string;
}

interface SuggestionCardsProps {
  suggestions: StrategySuggestion[];
  /** Drop a suggestion into the calendar (defaults to week 1). */
  onDrop: (s: StrategySuggestion) => void;
}

/** AI-generated content directions rendered as clickable drop-in cards. */
export default function SuggestionCards({ suggestions, onDrop }: SuggestionCardsProps) {
  if (suggestions.length === 0) {
    return (
      <p className="text-xs text-muted">
        Use the assist button to generate content directions from your brand pillars and top trends.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {suggestions.map((s, i) => (
        <li key={`${s.title}-${i}`}>
          <button
            type="button"
            onClick={() => onDrop(s)}
            className="group flex h-full w-full flex-col gap-2 rounded-xl border border-accent/25 bg-accent/[0.06] p-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:bg-accent/10 hover:shadow-[0_8px_20px_-10px_var(--color-accent)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            aria-label={`Add suggestion to calendar: ${s.title}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold leading-snug text-fg">{s.title}</span>
              <ArrowDownToLine
                className="size-4 shrink-0 text-accent opacity-50 transition-all group-hover:translate-y-0.5 group-hover:opacity-100"
                aria-hidden
                strokeWidth={1.5}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {s.emotional_pillar && (
                <span className="chip border-accent/30 bg-accent/10 text-accent">
                  {s.emotional_pillar}
                </span>
              )}
              {s.format && (
                <span className="chip border-border bg-surface-2/60 text-muted">{s.format}</span>
              )}
            </div>
            {s.hook && <p className="line-clamp-2 text-xs leading-relaxed text-muted">{s.hook}</p>}
            {s.narrative_theme && (
              <p className="mt-auto flex items-center gap-1.5 pt-0.5 text-[11px] text-muted/80">
                <Sparkles className="size-3 text-accent/70" aria-hidden strokeWidth={1.5} />
                {s.narrative_theme}
              </p>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
