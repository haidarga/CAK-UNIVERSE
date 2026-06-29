import { BarChart3, Eye, Heart, Activity, UserPlus, Trophy } from "lucide-react";
import { loadBrands, loadKpiSummary, loadPipeline } from "@/lib/dash-data";
import { fmtCompact, fmtPct } from "@/lib/utils";
import PageHeader from "@/components/page-header";
import BrandSelector from "@/components/brand-selector";
import GlassCard from "@/components/glass-card";
import Stat from "@/components/stat";
import EmptyState from "@/components/empty-state";
import ViewsChart from "@/components/views-chart";
import GenerateReportButton from "@/components/generate-report-button";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const { brands, selected } = await loadBrands(brand);

  if (!selected) {
    return (
      <>
        <PageHeader
          eyebrow="Operations · Analytics"
          title="Reports"
          subtitle="Performance KPIs and executive summaries"
        />
        <EmptyState
          icon={BarChart3}
          title="No brands configured"
          hint="Add a brand to view its reports. The database may be empty or environment variables are not set."
        />
      </>
    );
  }

  const [kpi, posted] = await Promise.all([
    loadKpiSummary(selected.id),
    loadPipeline(selected.id, ["posted"]),
  ]);

  const topPosts = [...posted]
    .sort((a, b) => (b.performance_score ?? 0) - (a.performance_score ?? 0))
    .slice(0, 5);

  return (
    <>
      <PageHeader
        eyebrow="Operations · Analytics"
        title="Reports"
        subtitle="Performance KPIs and executive summaries"
      >
        <BrandSelector
          brands={brands.map((b) => ({ id: b.id, slug: b.slug, name: b.name }))}
          selected={selected.slug}
        />
      </PageHeader>

      <div className="flex flex-col gap-6">
        {/* KPI bento — hero Total Views tile (double-bezel) leads */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="bezel animate-fade-up col-span-2">
            <div className="glass glass-hover flex h-full items-center justify-between gap-4 p-5">
              <Stat label="Total Views" value={fmtCompact(kpi.total_views)} icon={Eye} />
              <span
                aria-hidden
                className="hidden size-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-primary glow-primary sm:grid"
              >
                <Eye className="size-5" strokeWidth={1.5} />
              </span>
            </div>
          </div>
          <GlassCard className="animate-fade-up [animation-delay:60ms]">
            <Stat
              label="Engagements"
              value={fmtCompact(kpi.total_likes + kpi.total_comments + kpi.total_shares)}
              icon={Heart}
            />
          </GlassCard>
          <GlassCard className="animate-fade-up [animation-delay:120ms]">
            <Stat label="Avg Eng. Rate" value={fmtPct(kpi.avg_engagement_rate)} icon={Activity} />
          </GlassCard>
          <GlassCard className="animate-fade-up [animation-delay:160ms] col-span-2">
            <Stat label="Followers Gained" value={fmtCompact(kpi.followers_gained)} icon={UserPlus} />
          </GlassCard>
        </div>

        {/* Views chart */}
        <GlassCard
          title="Views Over Time"
          icon={BarChart3}
          className="animate-fade-up [animation-delay:200ms]"
          noHover
        >
          <ViewsChart data={kpi.views_series} />
        </GlassCard>

        {/* Top performing posts */}
        <GlassCard
          title="Top Performing Posts"
          icon={Trophy}
          className="animate-fade-up [animation-delay:240ms]"
          noHover
        >
          {topPosts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No posted content yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 font-mono text-[10px] uppercase tracking-widest text-muted">
                    <th className="py-2.5 pr-4 font-medium">Title</th>
                    <th className="py-2.5 pr-4 font-medium">Pillar</th>
                    <th className="py-2.5 pr-4 text-right font-medium">Views</th>
                    <th className="py-2.5 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {topPosts.map((p, i) => (
                    <tr
                      key={p.id}
                      className="border-b border-border/30 transition-colors last:border-0 hover:bg-white/[0.03]"
                    >
                      <td className="max-w-[18rem] truncate py-3 pr-4 font-medium text-fg">
                        <span className="mr-2 tnum font-mono text-xs text-muted">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {p.content_direction?.title ?? "Untitled"}
                      </td>
                      <td className="py-3 pr-4">
                        {p.emotional_pillar ? (
                          <span className="chip border-accent/30 bg-accent/10 text-accent">
                            {p.emotional_pillar}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="tnum py-3 pr-4 text-right text-fg">
                        {fmtCompact(p.performance?.views ?? 0)}
                      </td>
                      <td className="tnum py-3 text-right font-display font-bold text-fg">
                        {p.performance_score != null ? Math.round(p.performance_score) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        {/* Generate report */}
        <GlassCard
          title="Executive Report"
          icon={BarChart3}
          className="animate-fade-up [animation-delay:280ms]"
          noHover
        >
          <GenerateReportButton brandId={selected.id} />
        </GlassCard>
      </div>
    </>
  );
}
