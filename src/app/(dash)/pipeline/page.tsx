import { KanbanSquare } from "lucide-react";
import { loadBrands, loadPipeline } from "@/lib/dash-data";
import type { ContentPipeline } from "@/lib/types";
import type { PipelineStage } from "@/lib/constants";
import PageHeader from "@/components/page-header";
import BrandSelector from "@/components/brand-selector";
import PipelineCard from "@/components/pipeline-card";
import EmptyState from "@/components/empty-state";

export const dynamic = "force-dynamic";

// Kanban columns (subset of PIPELINE_STAGES surfaced on the board).
const COLUMNS: { stage: PipelineStage; label: string }[] = [
  { stage: "briefed", label: "Briefed" },
  { stage: "direction_set", label: "Direction Set" },
  { stage: "scripted", label: "Scripted" },
  { stage: "qc_review", label: "QC Review" },
  { stage: "qc_passed", label: "QC Passed" },
  { stage: "scheduled", label: "Scheduled" },
  { stage: "posted", label: "Posted" },
];

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const { brands, selected } = await loadBrands(brand);
  const items = selected ? await loadPipeline(selected.id) : [];

  const byStage = new Map<string, ContentPipeline[]>();
  for (const item of items) {
    const bucket = byStage.get(item.stage) ?? [];
    bucket.push(item);
    byStage.set(item.stage, bucket);
  }

  return (
    <>
      <PageHeader
        eyebrow="Operations · Production"
        title="Pipeline"
        subtitle="Content production stages across the brand"
      >
        <BrandSelector
          brands={brands.map((b) => ({ id: b.id, slug: b.slug, name: b.name }))}
          selected={selected?.slug}
        />
      </PageHeader>

      {!selected ? (
        <EmptyState
          icon={KanbanSquare}
          title="No brands configured"
          hint="Add a brand to view its content pipeline. The database may be empty or environment variables are not set."
        />
      ) : (
        <div className="animate-fade-up flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map(({ stage, label }, i) => {
            const cards = byStage.get(stage) ?? [];
            return (
              <div
                key={stage}
                className="glass-2 animate-fade-up flex w-72 shrink-0 flex-col gap-3 p-3"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-center justify-between px-1">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-muted">
                    {label}
                  </span>
                  <span className="tnum chip border-white/10 bg-white/[0.04] text-fg">
                    {cards.length}
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  {cards.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border/40 px-3 py-8 text-center text-xs text-muted/70">
                      Empty
                    </p>
                  ) : (
                    cards.map((item) => (
                      <PipelineCard key={item.id} item={item} brandName={selected.name} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
