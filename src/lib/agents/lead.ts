// ============================================================
// LeadAgent — executive Markdown performance report.
//
// Aggregates KPI metrics + pipeline counts for a brand and asks
// the LLM for a narrative Markdown report (NOT JSON).
// ============================================================
import { BaseAgent } from "@/lib/agents/base";
import { admin } from "@/lib/supabase";
import type { Brand, KpiMetric } from "@/lib/types";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/constants";

export const LEAD_SYSTEM = `You are the Lead. You write a concise, executive-level performance report in MARKDOWN for a brand owner.

Structure:
# <Brand> Performance Report — <period>
## TL;DR  (2-3 bullets)
## Growth & Engagement  (interpret the KPI aggregates)
## Content Pipeline Health  (interpret the stage counts; call out bottlenecks)
## Recommendations  (3-5 concrete next actions)

Be specific, reference the numbers given, and keep it under ~500 words. Respond with ONLY the Markdown report (no JSON, no code fences).`;

interface KpiAggregate {
  totalFollowersGained: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  postsPublished: number;
  avgEngagementRate: number;
  days: number;
}

export class LeadAgent extends BaseAgent {
  constructor() {
    super("lead");
  }

  /** Produce a Markdown performance report for a brand. */
  async generateReport(
    brandId: string,
    period = "last 30 days",
  ): Promise<{ markdown: string; tokensUsed: number }> {
    const brand = (await this.getBrand(brandId)) as Brand | null;
    if (!brand) return { markdown: `# Report unavailable\n\nBrand ${brandId} not found.`, tokensUsed: 0 };

    const kpi = await this.aggregateKpis(brandId);
    const stageCounts = await this.pipelineStageCounts(brandId);

    const prompt = this.buildPrompt(brand, period, kpi, stageCounts);

    const result = await this.run<string>({
      system: LEAD_SYSTEM,
      prompt,
      json: false,
      temperature: 0.5,
      maxTokens: 2048,
      brandId,
      runType: "triggered",
    });

    if (!result.success || !result.data) {
      return {
        markdown: `# Report generation failed\n\n${result.error ?? "Unknown error"}`,
        tokensUsed: result.tokensUsed ?? 0,
      };
    }

    return { markdown: result.data.trim(), tokensUsed: result.tokensUsed ?? 0 };
  }

  private buildPrompt(
    brand: Brand,
    period: string,
    kpi: KpiAggregate,
    stageCounts: Record<string, number>,
  ): string {
    const stageLines = PIPELINE_STAGES.map((s) => `- ${s}: ${stageCounts[s] ?? 0}`).join("\n");

    return `BRAND: ${brand.name}
PERIOD: ${period}
KPI TARGETS: ${brand.kpi_targets ? JSON.stringify(brand.kpi_targets) : "(none set)"}

KPI AGGREGATES (${kpi.days} days of data):
- Followers gained: ${kpi.totalFollowersGained}
- Total views: ${kpi.totalViews}
- Total likes: ${kpi.totalLikes}
- Total comments: ${kpi.totalComments}
- Total shares: ${kpi.totalShares}
- Posts published: ${kpi.postsPublished}
- Avg engagement rate: ${(kpi.avgEngagementRate * 100).toFixed(2)}%

PIPELINE STAGE COUNTS:
${stageLines}

Write the Markdown report.`;
  }

  private async aggregateKpis(brandId: string): Promise<KpiAggregate> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

    const { data } = await admin()
      .from("kpi_metrics")
      .select("*")
      .eq("brand_id", brandId)
      .gte("date", thirtyDaysAgo);

    const rows = (data ?? []) as KpiMetric[];

    const engRates = rows
      .map((r) => r.engagement_rate)
      .filter((v): v is number => typeof v === "number");

    return {
      totalFollowersGained: rows.reduce((s, r) => s + (r.followers_gained ?? 0), 0),
      totalViews: rows.reduce((s, r) => s + (r.total_views ?? 0), 0),
      totalLikes: rows.reduce((s, r) => s + (r.total_likes ?? 0), 0),
      totalComments: rows.reduce((s, r) => s + (r.total_comments ?? 0), 0),
      totalShares: rows.reduce((s, r) => s + (r.total_shares ?? 0), 0),
      postsPublished: rows.reduce((s, r) => s + (r.posts_published ?? 0), 0),
      avgEngagementRate:
        engRates.length > 0 ? engRates.reduce((a, b) => a + b, 0) / engRates.length : 0,
      days: rows.length,
    };
  }

  private async pipelineStageCounts(brandId: string): Promise<Record<string, number>> {
    const { data } = await admin()
      .from("content_pipeline")
      .select("stage")
      .eq("brand_id", brandId);

    const rows = (data ?? []) as { stage: PipelineStage }[];
    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.stage] = (counts[r.stage] ?? 0) + 1;
    }
    return counts;
  }
}
