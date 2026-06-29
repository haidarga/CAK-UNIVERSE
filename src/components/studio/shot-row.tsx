"use client";

import { useState } from "react";
import { Clock, Mic, Scissors, Sparkles } from "lucide-react";
import AiAssistInline from "@/components/ai-assist-inline";
import type { Shot } from "@/lib/types";

interface ShotRowProps {
  shot: Shot;
}

/** One shot: number, duration, editable CAKAI prompt, voice line, transition. */
export default function ShotRow({ shot }: ShotRowProps) {
  const [prompt, setPrompt] = useState(shot.cakai_prompt ?? "");

  return (
    <div className="glass-2 rounded-xl p-3.5 transition-colors hover:border-primary/30">
      <div className="flex items-center justify-between gap-2">
        <span className="tnum font-display flex size-8 items-center justify-center rounded-lg border border-primary/40 bg-primary/15 text-sm font-semibold text-primary">
          {shot.shot_number}
        </span>
        <span className="tnum flex items-center gap-1 text-xs text-muted">
          <Clock className="size-3.5" strokeWidth={1.5} aria-hidden />
          {Math.round(shot.duration_seconds ?? 0)}s
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <label className="eyebrow">CAKAI prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          aria-label={`CAKAI prompt for shot ${shot.shot_number}`}
          className="w-full resize-y rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-sm leading-relaxed text-fg/90 outline-none transition-colors hover:border-white/20 focus-visible:ring-2 focus-visible:ring-primary/60"
        />
        <AiAssistInline
          tool="generic"
          getInput={() => prompt}
          context="shot direction"
          label="Tweak prompt"
          onResult={(r: { text: string; data?: unknown }) => setPrompt(r.text)}
          className="mt-0.5"
        />
      </div>

      {shot.persona_voice_line && (
        <p className="mt-3 flex items-start gap-2 text-xs text-fg/80">
          <Mic className="mt-0.5 size-3.5 shrink-0 text-accent" strokeWidth={1.5} aria-hidden />
          <span className="italic">&ldquo;{shot.persona_voice_line}&rdquo;</span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {shot.capcut_transition && (
          <span className="chip border-border/60 bg-surface-2/60 text-muted">
            <Scissors className="size-3" strokeWidth={1.5} aria-hidden />
            {shot.capcut_transition}
          </span>
        )}
        {shot.audio_notes && (
          <span className="chip border-border/60 bg-surface-2/60 text-muted">
            <Sparkles className="size-3" strokeWidth={1.5} aria-hidden />
            {shot.audio_notes}
          </span>
        )}
      </div>

      {shot.visual_notes && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">{shot.visual_notes}</p>
      )}
    </div>
  );
}
