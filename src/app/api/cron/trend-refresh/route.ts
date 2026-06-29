// ============================================================
// GET /api/cron/trend-refresh — refresh the `trends` table via the
// Lightpanda (CDP) browser scrape. Guarded by isAuthorizedCron.
//
// Primary (and only) path: scrapeAllTrends() drives Lightpanda to scrape
// VIRAL / TRENDING / HIGH-ENGAGEMENT content from BOTH TikTok AND Instagram
// (brand-relevant hashtags + IG explore) and upserts into `trends`. No API
// keys. If LIGHTPANDA_CDP_URL is absent, we degrade gracefully (200 + note)
// rather than failing the cron — start `lightpanda serve` with a logged-in
// account to enable it.
// ============================================================
import { ok, err, isAuthorizedCron } from "@/lib/api";
import { scrapeAllTrends } from "@/lib/integrations/connectors/lightpanda";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PLATFORMS = ["tiktok", "instagram"] as const;

export async function GET(req: Request) {
  try {
    if (!isAuthorizedCron(req)) return err("unauthorized", 401);

    if (!process.env.LIGHTPANDA_CDP_URL) {
      return ok({
        source: "lightpanda",
        platforms: PLATFORMS,
        itemsSynced: 0,
        note: "LIGHTPANDA_CDP_URL not set; start `lightpanda serve` with a logged-in account",
      });
    }

    const { itemsSynced, notes } = await scrapeAllTrends();
    return ok({
      source: "lightpanda",
      platforms: PLATFORMS,
      itemsSynced,
      note: notes.join(" | ") || "ok",
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Trend refresh cron failed", 500);
  }
}
