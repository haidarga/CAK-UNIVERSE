// ============================================================
// GET /api/sge/highlights — curated Social Growth Engineers feed.
//
// Returns the latest SGE articles (Pro Briefing + public categories) with
// excerpts where available. Powers the SGE Viral Lab highlights strip.
// Requires the shared Chrome/CDP session to be up (LIGHTPANDA_CDP_URL);
// returns an empty list (not an error) when SGE is unreachable.
// ============================================================
import { ok, err } from "@/lib/api";
import { fetchSGEArticles } from "@/lib/integrations/scrapers/sge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const articles = await fetchSGEArticles(18);
    return ok({ articles });
  } catch (e) {
    return err(e instanceof Error ? e.message : "sge highlights failed", 500);
  }
}
