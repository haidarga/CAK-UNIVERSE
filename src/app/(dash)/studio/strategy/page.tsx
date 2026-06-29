import { Compass } from "lucide-react";
import { admin } from "@/lib/supabase";
import { loadBrands, loadPipeline } from "@/lib/dash-data";
import type { Trend, EmbeddedResource } from "@/lib/types";
import PageHeader from "@/components/page-header";
import BrandSelector from "@/components/brand-selector";
import EmptyState from "@/components/empty-state";
import StrategyBoard from "@/components/studio/strategy-board";

export const dynamic = "force-dynamic";

const DIRECTION_STAGES = ["briefed", "direction_set", "scripted"];

async function loadTrends(brandId: string): Promise<Trend[]> {
  try {
    const { data, error } = await admin()
      .from("trends")
      .select("*")
      .eq("brand_id", brandId)
      .order("relevance_score", { ascending: false })
      .limit(12);
    if (error) throw error;
    return (data ?? []) as Trend[];
  } catch {
    return [];
  }
}

async function loadSheetEmbeds(brandId: string): Promise<EmbeddedResource[]> {
  try {
    const { data, error } = await admin()
      .from("embedded_resources")
      .select("*")
      .eq("brand_id", brandId)
      .eq("kind", "sheet")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as EmbeddedResource[];
  } catch {
    return [];
  }
}

export default async function StrategyStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const { brands, selected } = await loadBrands(brand);

  const [trends, embeds, recent] = selected
    ? await Promise.all([
        loadTrends(selected.id),
        loadSheetEmbeds(selected.id),
        loadPipeline(selected.id, DIRECTION_STAGES),
      ])
    : [[], [], []];

  return (
    <>
      <PageHeader
        eyebrow="Strategy"
        title="Strategist Studio"
        subtitle="Read trends, build the calendar, and push directions into the pipeline"
      >
        <BrandSelector
          brands={brands.map((b) => ({ id: b.id, slug: b.slug, name: b.name }))}
          selected={selected?.slug}
        />
      </PageHeader>

      {!selected ? (
        <div className="animate-fade-up">
          <EmptyState
            icon={Compass}
            title="No brands configured"
            hint="Add a brand to plan strategy. The database may be empty or environment variables are not set."
          />
        </div>
      ) : (
        <div className="animate-fade-up">
          <StrategyBoard brand={selected} trends={trends} embeds={embeds} recent={recent} />
        </div>
      )}
    </>
  );
}
