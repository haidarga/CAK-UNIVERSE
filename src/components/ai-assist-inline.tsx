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
    <span className={cn("inline-flex items-center gap-2", className)}>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        aria-busy={loading}
        aria-label={text}
        className={cn(
          "inline-flex min-h-[32px] cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary/60",
          "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20",
          loading && "cursor-not-allowed opacity-70",
        )}
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="size-3.5" aria-hidden />
        )}
        {text}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
