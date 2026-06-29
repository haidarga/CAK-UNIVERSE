import { Clapperboard, FileText } from "lucide-react";
import { loadBrands, loadPipeline } from "@/lib/dash-data";
import PageHeader from "@/components/page-header";
import BrandSelector from "@/components/brand-selector";
import EmptyState from "@/components/empty-state";
import CreatorPanel from "@/components/studio/creator-panel";

export const dynamic = "force-dynamic";

// Stages shown in the creator view. "scripted" items are visible (so creators
// can see what's coming) but shot generation is gated to GENERATE_STAGES below.
const STAGES = ["scripted", "script_reviewed", "produced"];
// Only reviewed scripts + already-produced items can generate shots.
const GENERATE_STAGES = new Set(["script_reviewed", "produced"]);

export default async function CreatorStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const { brands, selected } = await loadBrands(brand);
  const items = selected ? await loadPipeline(selected.id, STAGES) : [];

  return (
    <>
      <PageHeader
        eyebrow="Studio"
        title="Creator Studio"
        subtitle="Turn reviewed scripts into a shot-by-shot Seedance plan"
      >
        <BrandSelector
          brands={brands.map((b) => ({ id: b.id, slug: b.slug, name: b.name }))}
          selected={selected?.slug}
        />
      </PageHeader>

      {!selected ? (
        <EmptyState
          icon={Clapperboard}
          title="No brands configured"
          hint="Add a brand to start producing shots. The database may be empty or environment variables are not set."
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nothing in the creator queue"
          hint="Scripts appear here once written. Shot generation unlocks after the Head of Creator marks them as reviewed."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {items.map((item, idx) => {
            const title = item.content_direction?.title ?? "Untitled item";
            const scriptText = item.script?.text ?? "";
            const personaCtx = [
              item.content_format && `format: ${item.content_format}`,
              item.emotional_pillar && `pillar: ${item.emotional_pillar}`,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <div
                key={item.id}
                className="animate-fade-up"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <CreatorPanel
                  pipelineId={item.id}
                  title={title}
                  stage={item.stage}
                  scriptText={scriptText}
                  contextLine={personaCtx}
                  initialShots={item.production_params?.shots ?? []}
                  canGenerate={GENERATE_STAGES.has(item.stage)}
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
