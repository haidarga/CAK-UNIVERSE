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
      <p className="text-xs leading-relaxed text-muted">
        Generate hooks with the assist button, or no hook bank entries exist for this pillar yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {suggestions.length > 0 && (
        <div>
          <p className="eyebrow mb-2.5 flex items-center gap-1.5 text-accent">
            <Sparkles className="size-3" aria-hidden />
            AI suggestions
          </p>
          <ul className="flex flex-col gap-2">
            {suggestions.map((h, i) => (
              <li key={`ai-${i}`}>
                <button
                  type="button"
                  onClick={() => onInsert(h)}
                  className="group/hook w-full rounded-[0.85rem] border border-accent/30 bg-accent/5 px-3.5 py-2.5 text-left text-sm text-fg/90 shadow-[0_1px_2px_rgba(0,0,0,0.15)] transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-accent/60 hover:bg-accent/10 hover:shadow-[0_8px_24px_-12px_rgba(99,102,241,0.5)] active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
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
          <p className="eyebrow mb-2.5 flex items-center gap-1.5 text-muted">
            <Quote className="size-3" aria-hidden />
            Hook bank
          </p>
          <ul className="flex flex-col gap-2">
            {bank.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => onInsert(h.text)}
                  className="group/hook w-full rounded-[0.85rem] border border-border/60 bg-surface-2/40 px-3.5 py-2.5 text-left text-sm text-fg/90 transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface-2/70 hover:shadow-[0_8px_24px_-14px_rgba(0,0,0,0.6)] active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
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
