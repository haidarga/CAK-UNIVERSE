"use client";

import { ClipboardList } from "lucide-react";
import type { ContentPipeline } from "@/lib/types";
import ContentPlanCard from "./content-plan-card";

interface ScriptWorkspaceProps {
  /** Planned directions waiting for a script (direction_set / briefed). */
  toWrite: ContentPipeline[];
}

/**
 * Client shell for the Script studio dashboard.
 * Displays all briefs/directions that need scripts.
 * Clicking a card routes the user to the Cockpit UI.
 */
export default function ScriptWorkspace({
  toWrite,
}: ScriptWorkspaceProps) {
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
            Klik Buka Cockpit untuk mulai menulis naskah dengan bantuan AI
          </span>
        </div>

        {toWrite.length === 0 ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-muted">
              Belum ada arahan dari strategist. Direction yang di-push akan muncul di sini.
            </p>
            <button
              onClick={() => window.location.href = '/scripts/workspace/demo-123'}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600/60"
            >
              🚀 Buka Cockpit (Test Mode)
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {toWrite.map((item) => (
              <ContentPlanCard
                key={item.id}
                item={item}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
