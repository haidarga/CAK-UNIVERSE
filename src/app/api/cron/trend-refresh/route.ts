// ============================================================
// GET /api/cron/trend-refresh — refresh the `trends` table via the
// Lightpanda (CDP) TikTok scraper. Guarded by isAuthorizedCron.
//
// Primary path: LightpandaConnector scrapes brand-relevant TikTok hashtags
// and upserts trending content. If LIGHTPANDA_CDP_URL is absent, we fall
// back to a (not-yet-implemented) RapidAPI path and return gracefully.
// ============================================================
import { ok, err, isAuthorizedCron } from "@/lib/api";
import { LightpandaConnector } from "@/lib/integrations/connectors/lightpanda";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    if (!isAuthorizedCron(req)) return err("unauthorized", 401);

    const connector = new LightpandaConnector();

    if (!connector.isConfigured()) {
      // FALLBACK (RapidAPI): not implemented. When LIGHTPANDA_CDP_URL is
      // unset, a future path would call the TikTok RapidAPI (RAPIDAPI_KEY)
      // to fetch trending hashtags/videos and upsert them into `trends`.
      // For now we degrade gracefully rather than failing the cron.
      return ok({
        source: "none",
        itemsSynced: 0,
        note: "LIGHTPANDA_CDP_URL not set; RapidAPI fallback not implemented",
      });
    }

    const result = await connector.sync();
    return ok({
      source: "lightpanda",
      itemsSynced: result.itemsSynced,
      note: result.note ?? result.error ?? "ok",
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Trend refresh cron failed", 500);
  }
}
