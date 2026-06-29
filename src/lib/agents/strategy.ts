// ============================================================
// StrategyAgent — generates a 30-day content calendar.
//
// Pulls the brand + recent trends and returns an array of
// ContentDirection items. Does NOT insert pipeline rows — the
// caller decides what to schedule.
// ============================================================
import { BaseAgent } from "@/lib/agents/base";
import { admin } from "@/lib/supabase";
import type { Brand, ContentDirection, Trend } from "@/lib/types";

export const STRATEGY_SYSTEM = `You are the Strategy lead. You design a 30-day short-form content calendar for a brand.

Use the brand's emotional pillars, content formats, products, and recent trend signals. Spread directions across the 30 days, vary the emotional pillars and formats, and weave in trending angles where relevant. Assign week_number (1-5) sensibly.

Each item must match this shape:
{
  "title": string,
  "format": string,
  "emotional_angle": string,
  "emotional_pillar": string,
  "hook": string,
  "product_featured": string,
  "week_number": number,
  "narrative_theme": string,
  "research_notes": string
}

Respond with ONLY a JSON ARRAY of these items (aim for ~20-30 items covering 30 days).`;

export class StrategyAgent extends BaseAgent {
  constructor() {
    super("strategy");
  }

  /** Produce a 30-day calendar of content directions for a brand. */
  async generateCalendar(brandId: string): Promise<ContentDirection[]> {
    const brand = (await this.getBrand(brandId)) as Brand | null;
    if (!brand) return [];

    const trends = await this.getRecentTrends(brandId);

    const prompt = this.buildPrompt(brand, trends);

    const result = await this.run<ContentDirection[]>({
      system: STRATEGY_SYSTEM,
      prompt,
      json: true,
      temperature: 0.85,
      maxTokens: 6144,
      brandId,
      runType: "triggered",
    });

    if (!result.success || !result.data) return [];
    return Array.isArray(result.data) ? result.data : [];
  }

  private buildPrompt(brand: Brand, trends: Trend[]): string {
    const trendSummary =
      trends.length > 0
        ? trends
            .slice(0, 15)
            .map(
              (t) =>
                `- [${t.platform}] ${t.content_category ?? "general"} | angle: ${t.emotional_angle ?? "n/a"} | hook: ${t.hook_pattern ?? "n/a"} | format: ${t.format_type ?? "n/a"} | relevance: ${t.relevance_score}`,
            )
            .join("\n")
        : "- (no recent trends recorded)";

    return `BRAND: ${brand.name}
PLATFORM: ${brand.platform}
TAGLINE: ${brand.campaign_tagline ?? "(none)"}
EMOTIONAL PILLARS: ${(brand.emotional_pillars ?? []).join(", ") || "(none)"}
CONTENT FORMATS: ${(brand.content_formats ?? []).join(", ") || "(none)"}
PRODUCTS: ${(brand.products ?? []).join(", ") || "(none)"}
HERO PRODUCTS: ${(brand.hero_products ?? []).join(", ") || "(none)"}
GUIDELINES: ${brand.guidelines ?? "(none)"}

RECENT TRENDS:
${trendSummary}

Generate the 30-day content calendar now.`;
  }

  private async getRecentTrends(brandId: string): Promise<Trend[]> {
    const { data } = await admin()
      .from("trends")
      .select("*")
      .or(`brand_id.eq.${brandId},brand_id.is.null`)
      .order("relevance_score", { ascending: false })
      .limit(20);
    return (data ?? []) as Trend[];
  }
}
