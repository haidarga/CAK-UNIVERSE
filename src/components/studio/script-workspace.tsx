"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Rocket, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Brand, Persona, Hook, EmbeddedResource, ContentPipeline, Script } from "@/lib/types";
import ContentPlanCard from "./content-plan-card";
import ScriptEditor from "./script-editor";

type JebretNote = { type: "ok" | "warn" | "error"; msg: string };

interface GenerateResult {
  success?: boolean;
  error?: string;
  guardrailFlag?: boolean;
  violations?: string[];
  stage?: string;
  script?: Script;
}

interface ScriptWorkspaceProps {
  brand: Brand;
  personas: Persona[];
  hooks: Hook[];
  embeds: EmbeddedResource[];
  /** Planned directions waiting for a script (direction_set / briefed). */
  toWrite: ContentPipeline[];
  /** Scripts already in flight (scripted / script_reviewed / guardrail_review). */
  inProgress: ContentPipeline[];
}

/**
 * Client shell for the Script studio. Owns the "active direction" handoff:
 * clicking "Tulis naskah" on a Content Plan card loads that direction into the
 * editor; saving advances the same pipeline row to "scripted".
 */
export default function ScriptWorkspace({
  brand,
  personas,
  hooks,
  embeds,
  toWrite,
  inProgress,
}: ScriptWorkspaceProps) {
  const router = useRouter();
  const [activeItem, setActiveItem] = useState<ContentPipeline | null>(null);
  const [jebretId, setJebretId] = useState<string | null>(null);
  const [note, setNote] = useState<JebretNote | null>(null);

  /** One-click: ScriptWriterAgent writes the full script, then load it to edit. */
  async function handleJebret(item: ContentPipeline) {
    setJebretId(item.id);
    setNote(null);
    try {
      const res = await fetch("/api/agents/script-writer/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineId: item.id }),
      });
      const json: { success?: boolean; error?: string; data?: GenerateResult } = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error ?? "Gagal generate naskah");
      const result = json.data ?? {};
      if (result.success === false) throw new Error(result.error ?? "Gagal generate naskah");

      // Load the generated script straight into the editor for review/edit.
      const generated = result.script ?? item.script ?? null;
      setActiveItem({
        ...item,
        script: generated,
        stage: (result.stage ?? "scripted") as ContentPipeline["stage"],
      });

      setNote(
        result.guardrailFlag
          ? {
              type: "warn",
              msg: `Naskah jadi tapi kena guardrail: ${
                (result.violations ?? []).join(", ") || "klaim terlarang"
              }. Udah ke-load di editor — tinggal benerin & simpan.`,
            }
          : { type: "ok", msg: "Naskah AI kelar & ke-load di editor bawah ↓ — review, edit, simpan." },
      );
      router.refresh();
    } catch (e) {
      setNote({ type: "error", msg: e instanceof Error ? e.message : "Gagal generate naskah" });
    } finally {
      setJebretId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="content-plan-heading" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4 text-muted" aria-hidden />
          <h2
            id="content-plan-heading"
            className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted"
          >
            Content Plan — siap ditulis
          </h2>
          {toWrite.length > 0 && (
            <span className="tnum rounded-full border border-border bg-surface-2/60 px-2 py-0.5 text-[11px] text-muted">
              {toWrite.length}
            </span>
          )}
          <span className="ml-auto hidden text-[11px] text-muted sm:inline">
            <Rocket className="mr-1 inline size-3 text-accent" aria-hidden /> Jebret = AI tulis full ·
            Tulis manual = editor
          </span>
        </div>

        {note && (
          <div
            className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${
              note.type === "ok"
                ? "border-success/30 bg-success/[0.06] text-success"
                : note.type === "warn"
                  ? "border-amber-400/30 bg-amber-400/[0.06] text-amber-300"
                  : "border-danger/30 bg-danger/[0.06] text-danger"
            }`}
            role="status"
          >
            {note.type === "ok" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden strokeWidth={1.5} />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden strokeWidth={1.5} />
            )}
            <span>{note.msg}</span>
          </div>
        )}

        {toWrite.length === 0 ? (
          <p className="text-sm text-muted">
            Belum ada arahan dari strategist. Direction yang di-push akan muncul di sini.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {toWrite.map((item) => (
              <ContentPlanCard
                key={item.id}
                item={item}
                active={activeItem?.id === item.id}
                onWrite={setActiveItem}
                onJebret={handleJebret}
                jebretLoading={jebretId === item.id}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="script-running-heading" className="flex flex-col gap-3">
        <h2
          id="script-running-heading"
          className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted"
        >
          Naskah berjalan
        </h2>
        <ScriptEditor
          brand={brand}
          personas={personas}
          hooks={hooks}
          embeds={embeds}
          items={inProgress}
          loadItem={activeItem}
          onSaved={() => {
            setActiveItem(null);
            router.refresh();
          }}
        />
      </section>
    </div>
  );
}
