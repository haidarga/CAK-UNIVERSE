"use client";

import { Sparkles, Quote } from "lucide-react";

interface HookChipsProps {
  /** AI-suggested hooks (from script_hook). */
  suggestions: string[];
  /** Existing hook bank entries for the selected pillar. */
  bank: { id: string; text: string; pillar: string }[];
  /** Insert a hook into the draft. */
  onInsert: (hook: string) => void;
}

/**
 * Two clickable hook sources: freshly generated AI hooks and the brand's
 * existing hook bank. Clicking a chip inserts it at the top of the draft.
 */
export default function HookChips({ suggestions, bank, onInsert }: HookChipsProps) {
  const hasAny = suggestions.length > 0 || bank.length > 0;
  if (!hasAny) {
    return (
      <p className="text-xs text-muted">
        Generate hooks with the assist button, or no hook bank entries exist for this pillar yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {suggestions.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-accent">
            <Sparkles className="size-3" aria-hidden />
            AI suggestions
          </p>
          <ul className="flex flex-col gap-1.5">
            {suggestions.map((h, i) => (
              <li key={`ai-${i}`}>
                <button
                  type="button"
                  onClick={() => onInsert(h)}
                  className="w-full rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-left text-sm text-fg/90 transition-colors hover:border-accent/60 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  aria-label={`Insert hook: ${h}`}
                >
                  {h}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {bank.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted">
            <Quote className="size-3" aria-hidden />
            Hook bank
          </p>
          <ul className="flex flex-col gap-1.5">
            {bank.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => onInsert(h.text)}
                  className="w-full rounded-xl border border-border/60 bg-surface-2/40 px-3 py-2 text-left text-sm text-fg/90 transition-colors hover:border-white/20 hover:bg-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  aria-label={`Insert hook: ${h.text}`}
                >
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
