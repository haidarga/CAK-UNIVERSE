"use client";

import { useMemo, useState } from "react";
import { Save, Loader2, Type, Check, AlertCircle } from "lucide-react";
import type { Brand, Persona, Hook, EmbeddedResource, ContentPipeline } from "@/lib/types";
import { checkGuardrails } from "@/lib/guardrails";
import { cn } from "@/lib/utils";
import GlassCard from "@/components/glass-card";
import AiAssistInline from "@/components/ai-assist-inline";
import { EmbedList } from "@/components/embed-resource";
import GuardrailBanner from "./guardrail-banner";
import HookChips from "./hook-chips";
import { Field, Select } from "./form-controls";

interface ScriptEditorProps {
  brand: Brand;
  personas: Persona[];
  hooks: Hook[];
  embeds: EmbeddedResource[];
  /** Existing scripted pipeline items, to seed/edit. */
  items: ContentPipeline[];
}

type SaveState = "idle" | "saving" | "saved" | "error";

const FORMATS = ["talking_head", "skit", "voiceover", "tutorial", "story", "ugc_review"];

/** Build the AI context string from brand + persona for script_enhance. */
function buildEnhanceContext(brand: Brand, persona: Persona | null, pillar: string): string {
  const parts = [
    `Brand: ${brand.name}`,
    brand.guidelines ? `Guidelines: ${brand.guidelines}` : "",
    brand.guardrails.length ? `Guardrails (NEVER violate): ${brand.guardrails.join("; ")}` : "",
    brand.cta_rules ? `CTA rules: ${brand.cta_rules}` : "",
    pillar ? `Emotional pillar: ${pillar}` : "",
    persona ? `Persona: ${persona.name} — ${persona.tone_of_voice ?? "natural"} (${persona.language})` : "",
  ];
  return parts.filter(Boolean).join("\n");
}

export default function ScriptEditor({ brand, personas, hooks, embeds, items }: ScriptEditorProps) {
  const pillars = brand.emotional_pillars.length ? brand.emotional_pillars : ["general"];

  const [title, setTitle] = useState("");
  const [format, setFormat] = useState(brand.content_formats[0] ?? FORMATS[0]);
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? "");
  const [pillar, setPillar] = useState(pillars[0]);
  const [draft, setDraft] = useState("");
  const [mono, setMono] = useState(true);
  const [hookSuggestions, setHookSuggestions] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const persona = personas.find((p) => p.id === personaId) ?? null;

  const guardrail = useMemo(
    () => checkGuardrails(draft, brand.guardrails),
    [draft, brand.guardrails],
  );

  const pillarHooks = useMemo(
    () =>
      hooks
        .filter((h) => !pillar || h.emotional_pillar === pillar)
        .map((h) => ({ id: h.id, text: h.hook_text, pillar: h.emotional_pillar })),
    [hooks, pillar],
  );

  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  function insertHook(hook: string) {
    setDraft((prev) => (prev ? `${hook}\n\n${prev}` : hook));
  }

  function applyEnhance(text: string) {
    if (text.trim()) setDraft(text);
  }

  function applyHookResult(data: unknown) {
    if (Array.isArray(data)) {
      setHookSuggestions(data.filter((x): x is string => typeof x === "string").slice(0, 6));
    }
  }

  async function save() {
    if (!title.trim() || !draft.trim()) {
      setSaveState("error");
      setSaveError("Add a title and script body before saving.");
      return;
    }
    setSaveState("saving");
    setSaveError(null);
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: brand.id,
          content_direction: { title: title.trim(), format, emotional_pillar: pillar },
          content_type: "script",
          emotional_pillar: pillar,
          content_format: format,
          persona_id: personaId || null,
          script: { text: draft, version: 1 },
          stage: "scripted",
        }),
      });
      const json: { success?: boolean; error?: string } = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error ?? "Save failed");
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : "Save failed");
    }
  }

  const enhanceCtx = buildEnhanceContext(brand, persona, pillar);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Editor column */}
      <div className="flex flex-col gap-4 lg:col-span-2">
        <GlassCard noHover>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Working title for this script"
                className="min-h-[44px] rounded-xl border border-border bg-surface-2/60 px-3.5 text-sm text-fg outline-none transition-colors hover:border-white/20 focus-visible:ring-2 focus-visible:ring-primary/60"
              />
            </label>
            <Field label="Format">
              <Select value={format} onChange={setFormat} options={brand.content_formats.length ? brand.content_formats : FORMATS} />
            </Field>
            <Field label="Emotional pillar">
              <Select value={pillar} onChange={setPillar} options={pillars} />
            </Field>
            <Field label="Persona">
              <Select
                value={personaId}
                onChange={setPersonaId}
                options={personas.map((p) => ({ value: p.id, label: p.name }))}
                placeholder={personas.length ? undefined : "No personas"}
              />
            </Field>
            <Field label="Editor">
              <button
                type="button"
                onClick={() => setMono((m) => !m)}
                aria-pressed={mono}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-surface-2/60 px-3.5 text-sm text-fg transition-colors hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <Type className="size-4" aria-hidden />
                {mono ? "Monospace" : "Sans"}
              </button>
            </Field>
          </div>

          <div className="mb-3">
            <GuardrailBanner violations={guardrail.violations} hasRules={brand.guardrails.length > 0} />
          </div>

          <label className="group/editor flex flex-col gap-1.5">
            <span className="sr-only">Script body</span>
            <div
              className={cn(
                "bezel transition-shadow duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] focus-within:shadow-[0_0_0_1px_rgba(99,102,241,0.35),0_18px_48px_-18px_rgba(99,102,241,0.45)]",
                guardrail.violations.length > 0 &&
                  "focus-within:shadow-[0_0_0_1px_rgba(239,68,68,0.4),0_18px_48px_-18px_rgba(239,68,68,0.5)]",
              )}
            >
              <div className="glass p-0">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write the script. The guardrail check above updates as you type."
                  spellCheck
                  rows={18}
                  className={cn(
                    "min-h-[440px] w-full resize-y rounded-[1.25rem] border bg-transparent p-5 text-sm leading-7 text-fg outline-none transition-colors placeholder:text-muted/70 focus-visible:ring-0",
                    guardrail.violations.length > 0 ? "border-danger/30" : "border-transparent",
                    mono ? "font-mono tracking-tight" : "font-sans",
                  )}
                />
              </div>
            </div>
          </label>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="tnum">{wordCount} words</span>
              <span className="tnum">{draft.length} chars</span>
            </div>
            <div className="flex items-center gap-2">
              <AiAssistInline
                tool="script_enhance"
                getInput={() => draft}
                context={enhanceCtx}
                label="Enhance"
                onResult={(r) => applyEnhance(r.text)}
              />
              <AiAssistInline
                tool="script_hook"
                getInput={() => draft || title}
                context={`Emotional pillar: ${pillar}\nBrand: ${brand.name}`}
                label="Hooks"
                onResult={(r) => applyHookResult(r.data ?? r.text)}
              />
              <button
                type="button"
                onClick={save}
                disabled={saveState === "saving"}
                className={cn(
                  "inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-60",
                  saveState === "saved"
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-primary/40 bg-primary/15 text-primary hover:bg-primary/25",
                )}
              >
                {saveState === "saving" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : saveState === "saved" ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <Save className="size-4" aria-hidden />
                )}
                {saveState === "saved" ? "Saved" : "Save as script"}
              </button>
            </div>
          </div>
          {saveError && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-danger" role="alert">
              <AlertCircle className="size-3.5" aria-hidden />
              {saveError}
            </p>
          )}
        </GlassCard>
      </div>

      {/* Side rail: hooks + embeds */}
      <div className="flex flex-col gap-4">
        <GlassCard title="Hooks" noHover>
          <HookChips suggestions={hookSuggestions} bank={pillarHooks} onInsert={insertHook} />
        </GlassCard>

        <GlassCard title="Attached docs" noHover>
          <EmbedList resources={embeds} />
        </GlassCard>

        {items.length > 0 && (
          <GlassCard title="Recent scripts" noHover>
            <ul className="flex flex-col gap-1.5">
              {items.slice(0, 8).map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setTitle(it.content_direction?.title ?? "");
                      setDraft(it.script?.text ?? "");
                      if (it.emotional_pillar) setPillar(it.emotional_pillar);
                      if (it.content_format) setFormat(it.content_format);
                    }}
                    className="w-full truncate rounded-lg px-2.5 py-2 text-left text-sm text-fg/80 transition-colors hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    {it.content_direction?.title ?? "Untitled script"}
                  </button>
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
