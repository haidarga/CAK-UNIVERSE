"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AssistTool } from "@/lib/ai-assist";

interface AiAssistInlineProps {
  /** Which assist preset to invoke (see lib/ai-assist AssistTool). */
  tool: AssistTool;
  /** Lazily read the current input at click time (e.g. a textarea value). */
  getInput: () => string;
  /** Optional brand voice / guardrails / instruction context. */
  context?: string;
  /** Button label; defaults to "AI Assist". */
  label?: string;
  /** Called on success with the assistant text and (for JSON tools) parsed data. */
  onResult?: (r: { text: string; data?: unknown }) => void;
  className?: string;
}

interface AssistEnvelope {
  success: boolean;
  data: { text?: string; data?: unknown } | null;
  error: string | null;
}

/**
 * The universal "✨ AI Assist" affordance. Self-contained: POSTs the current
 * input to /api/ai-assist and surfaces the result via onResult, with inline
 * loading + error states. No external state libraries.
 */
export default function AiAssistInline({
  tool,
  getInput,
  context,
  label,
  onResult,
  className,
}: AiAssistInlineProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = label ?? "AI Assist";

  async function run() {
    if (loading) return;
    setError(null);
    const input = getInput();
    if (!input || !input.trim()) {
      setError("Nothing to send yet.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ai-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, input, context }),
      });
      const json = (await res.json()) as AssistEnvelope;
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "AI Assist failed");
      }
      onResult?.({ text: json.data.text ?? "", data: json.data.data });
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI Assist failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className={cn("relative inline-flex items-center gap-2", className)}>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        aria-busy={loading}
        aria-label={text}
        className={cn(
          "group relative inline-flex min-h-[32px] cursor-pointer items-center gap-1.5 overflow-hidden rounded-full px-3.5 py-1 text-xs font-semibold",
          "border border-accent/30 bg-accent/[0.08] text-accent outline-none backdrop-blur-md",
          "ring-1 ring-inset ring-white/5 transition-all duration-300 [transition-timing-function:var(--ease-spring)]",
          "hover:border-accent/50 hover:bg-accent/[0.14] hover:shadow-[0_8px_28px_-10px_rgb(244_162_56/0.55)] active:scale-[0.97]",
          "focus-visible:ring-2 focus-visible:ring-accent/60",
          loading && "cursor-not-allowed opacity-80",
        )}
      >
        {/* soft sheen on hover */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-full"
        />
        {loading ? (
          <Loader2 className="relative size-3.5 animate-spin" aria-hidden />
        ) : (
          <Sparkles
            className="relative size-3.5 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110"
            aria-hidden
          />
        )}
        <span className="relative">{loading ? "Thinking…" : text}</span>
      </button>
      {error && (
        <span
          role="alert"
          className="chip border-danger/40 bg-danger/10 text-danger animate-fade-up"
        >
          {error}
        </span>
      )}
    </span>
  );
}
