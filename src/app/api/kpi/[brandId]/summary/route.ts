// ============================================================
// GET /api/kpi/[brandId]/summary — aggregate kpi_metrics for a brand
// over ?days= (default 7). Returns totals, averages, and a per-day
// views series.
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import type { KpiMetric } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    if (!brandId) return err("brandId is required", 400);

    const { searchParams } = new URL(req.url);
    const daysRaw = Number(searchParams.get("days"));
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.floor(daysRaw) : DEFAULT_DAYS;

    const since = new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);

    const { data, error } = await admin()
      .from("kpi_metrics")
      .select("*")
      .eq("brand_id", brandId)
      .gte("date", since)
      .order("date", { ascending: true });

    if (error) return err(error.message, 500);

    const rows = (data ?? []) as KpiMetric[];

    let totalViews = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    let followersGained = 0;
    let postsPublished = 0;
    let engagementSum = 0;
    let engagementCount = 0;
    const viewsByDate = new Map<string, number>();

    for (const r of rows) {
      totalViews += r.total_views ?? 0;
      totalLikes += r.total_likes ?? 0;
      totalComments += r.total_comments ?? 0;
      totalShares += r.total_shares ?? 0;
      followersGained += r.followers_gained ?? 0;
      postsPublished += r.posts_published ?? 0;
      if (typeof r.engagement_rate === "number") {
        engagementSum += r.engagement_rate;
        engagementCount += 1;
      }
      viewsByDate.set(r.date, (viewsByDate.get(r.date) ?? 0) + (r.total_views ?? 0));
    }

    const viewsSeries = [...viewsByDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([date, views]) => ({ date, views }));

    return ok({
      brand_id: brandId,
      days,
      total_views: totalViews,
      total_likes: totalLikes,
      total_comments: totalComments,
      total_shares: totalShares,
      followers_gained: followersGained,
      posts_published: postsPublished,
      avg_engagement_rate: engagementCount > 0 ? engagementSum / engagementCount : 0,
      views_series: viewsSeries,
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to summarize KPIs", 500);
  }
}
