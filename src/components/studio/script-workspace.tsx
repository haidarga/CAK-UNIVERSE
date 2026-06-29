"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import type { Brand, Persona, Hook, EmbeddedResource, ContentPipeline } from "@/lib/types";
import ContentPlanCard from "./content-plan-card";
import ScriptEditor from "./script-editor";

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
        </div>

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
