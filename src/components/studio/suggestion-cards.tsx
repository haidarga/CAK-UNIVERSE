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
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {suggestions.map((s, i) => (
        <li key={`${s.title}-${i}`}>
          <button
            type="button"
            onClick={() => onDrop(s)}
            className="group flex h-full w-full flex-col gap-1.5 rounded-xl border border-accent/25 bg-accent/5 p-3 text-left transition-colors hover:border-accent/60 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            aria-label={`Add suggestion to calendar: ${s.title}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold text-fg">{s.title}</span>
              <ArrowDownToLine
                className="size-4 shrink-0 text-accent opacity-60 transition-opacity group-hover:opacity-100"
                aria-hidden
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
            {s.hook && <p className="line-clamp-2 text-xs text-muted">{s.hook}</p>}
            {s.narrative_theme && (
              <p className="flex items-center gap-1 text-[11px] text-muted/80">
                <Sparkles className="size-3" aria-hidden />
                {s.narrative_theme}
              </p>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
