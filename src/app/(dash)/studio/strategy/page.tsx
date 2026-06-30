import { Compass } from "lucide-react";
import { admin } from "@/lib/supabase";
import { loadBrands, loadPipeline } from "@/lib/dash-data";
import type { Trend } from "@/lib/types";
import PageHeader from "@/components/page-header";
import BrandSelector from "@/components/brand-selector";
import EmptyState from "@/components/empty-state";
import StrategyBoard from "@/components/studio/strategy-board";
import TrendResearch from "@/components/studio/trend-research";
import SGEViralLab from "@/components/studio/sge-viral-lab";

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

export default async function StrategyStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const { brands, selected } = await loadBrands(brand);

  const [trends, recent] = selected
    ? await Promise.all([
        loadTrends(selected.id),
        loadPipeline(selected.id, DIRECTION_STAGES),
      ])
    : [[], []];

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
        <div className="animate-fade-up flex flex-col gap-5">
          <TrendResearch />
          <SGEViralLab />
          <StrategyBoard brand={selected} trends={trends} recent={recent} />
        </div>
      )}
    </>
  );
}
