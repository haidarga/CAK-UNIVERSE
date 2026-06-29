import { ShieldCheck, CheckCircle2, XCircle } from "lucide-react";
import { loadBrands, loadPipeline } from "@/lib/dash-data";
import type { ContentPipeline } from "@/lib/types";
import PageHeader from "@/components/page-header";
import BrandSelector from "@/components/brand-selector";
import EmptyState from "@/components/empty-state";
import GlassCard from "@/components/glass-card";
import Stat from "@/components/stat";
import QcPanel from "@/components/studio/qc-panel";

export const dynamic = "force-dynamic";

// QC Station scope: awaiting review (produced / qc_review) + already judged (passed / failed).
const STAGES = ["produced", "qc_review", "qc_passed", "qc_failed"];

function deriveVideoDescription(item: ContentPipeline): string {
  const dir = item.content_direction;
  const parts = [
    dir?.title,
    dir?.format && `format: ${dir.format}`,
    dir?.emotional_angle && `angle: ${dir.emotional_angle}`,
    dir?.hook && `hook: ${dir.hook}`,
    item.script?.text,
  ].filter(Boolean);
  return parts.join("\n").slice(0, 2000) || item.id;
}

export default async function QcStationPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const { brands, selected } = await loadBrands(brand);
  const items = selected ? await loadPipeline(selected.id, STAGES) : [];

  const awaiting = items.filter((i) => i.stage === "produced" || i.stage === "qc_review").length;
  const passed = items.filter((i) => i.stage === "qc_passed").length;
  const failed = items.filter((i) => i.stage === "qc_failed").length;

  return (
    <>
      <PageHeader
        title="QC Station"
        subtitle="Run AI quality control and get fix-it guidance on every issue"
      >
        <BrandSelector
          brands={brands.map((b) => ({ id: b.id, slug: b.slug, name: b.name }))}
          selected={selected?.slug}
        />
      </PageHeader>

      {!selected ? (
        <EmptyState
          icon={ShieldCheck}
          title="No brands configured"
          hint="Add a brand to review its QC queue. The database may be empty or environment variables are not set."
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="QC station is clear"
          hint="Produced content shows up here for quality review."
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <GlassCard noHover>
              <Stat label="Awaiting QC" value={awaiting} icon={ShieldCheck} />
            </GlassCard>
            <GlassCard noHover className={passed > 0 ? "border-success/30" : undefined}>
              <Stat label="Passed" value={passed} icon={CheckCircle2} />
            </GlassCard>
            <GlassCard noHover className={failed > 0 ? "border-danger/30" : undefined}>
              <Stat label="Failed" value={failed} icon={XCircle} />
            </GlassCard>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {items.map((item) => {
              const title = item.content_direction?.title ?? "Untitled item";
              const summary =
                item.script?.text?.slice(0, 240) ??
                item.content_direction?.research_notes ??
                "No script summary available.";
              return (
                <QcPanel
                  key={item.id}
                  pipelineId={item.id}
                  title={title}
                  stage={item.stage}
                  summary={summary}
                  videoDescription={deriveVideoDescription(item)}
                  initialReport={item.qc_report}
                />
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
