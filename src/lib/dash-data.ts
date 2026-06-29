// ============================================================
// Server-side data helpers for the dashboard pages.
// Every read is wrapped in try/catch so an empty / unconfigured
// DB never throws at build or preview time — callers get [].
// ============================================================
import { admin } from "./supabase";
import type { Brand, Account, ContentPipeline, KpiMetric } from "./types";

export interface BrandSelection {
  brands: Brand[];
  selected: Brand | null;
}

/** Load all brands and resolve the active one from a slug. */
export async function loadBrands(slug?: string): Promise<BrandSelection> {
  try {
    const { data, error } = await admin()
      .from("brands")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    const brands = (data ?? []) as Brand[];
    const selected = brands.find((b) => b.slug === slug) ?? brands[0] ?? null;
    return { brands, selected };
  } catch {
    return { brands: [], selected: null };
  }
}

/** Accounts for a brand, newest activity first. */
export async function loadAccounts(brandId: string): Promise<Account[]> {
  try {
    const { data, error } = await admin()
      .from("accounts")
      .select("*")
      .eq("brand_id", brandId)
      .order("follower_count", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Account[];
  } catch {
    return [];
  }
}

/** Pipeline items for a brand, optionally filtered to a set of stages. */
export async function loadPipeline(brandId: string, stages?: string[]): Promise<ContentPipeline[]> {
  try {
    let query = admin().from("content_pipeline").select("*").eq("brand_id", brandId);
    if (stages && stages.length > 0) query = query.in("stage", stages);
    const { data, error } = await query.order("priority", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ContentPipeline[];
  } catch {
    return [];
  }
}

export interface KpiSummary {
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  followers_gained: number;
  posts_published: number;
  avg_engagement_rate: number;
  views_series: { date: string; views: number }[];
}

const EMPTY_KPI: KpiSummary = {
  total_views: 0,
  total_likes: 0,
  total_comments: 0,
  total_shares: 0,
  followers_gained: 0,
  posts_published: 0,
  avg_engagement_rate: 0,
  views_series: [],
};

/** Aggregate kpi_metrics for a brand over `days`, mirroring the API summary. */
export async function loadKpiSummary(brandId: string, days = 14): Promise<KpiSummary> {
  try {
    const dayMs = 24 * 60 * 60 * 1000;
    const since = new Date(Date.now() - days * dayMs).toISOString().slice(0, 10);
    const { data, error } = await admin()
      .from("kpi_metrics")
      .select("*")
      .eq("brand_id", brandId)
      .gte("date", since)
      .order("date", { ascending: true });
    if (error) throw error;

    const rows = (data ?? []) as KpiMetric[];
    const summary: KpiSummary = { ...EMPTY_KPI, views_series: [] };
    const viewsByDate = new Map<string, number>();
    let engSum = 0;
    let engCount = 0;

    for (const r of rows) {
      summary.total_views += r.total_views ?? 0;
      summary.total_likes += r.total_likes ?? 0;
      summary.total_comments += r.total_comments ?? 0;
      summary.total_shares += r.total_shares ?? 0;
      summary.followers_gained += r.followers_gained ?? 0;
      summary.posts_published += r.posts_published ?? 0;
      if (typeof r.engagement_rate === "number") {
        engSum += r.engagement_rate;
        engCount += 1;
      }
      viewsByDate.set(r.date, (viewsByDate.get(r.date) ?? 0) + (r.total_views ?? 0));
    }

    summary.avg_engagement_rate = engCount > 0 ? engSum / engCount : 0;
    summary.views_series = [...viewsByDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([date, views]) => ({ date, views }));

    return summary;
  } catch {
    return { ...EMPTY_KPI, views_series: [] };
  }
}
