// ============================================================
// GET /api/cron/kpi-sync — refresh account metrics via the Lightpanda (CDP)
// TikTok profile scraper, then write today's kpi_metrics snapshot per
// account and update the accounts row. Guarded by isAuthorizedCron.
//
// Graceful degradation: if LIGHTPANDA_CDP_URL is absent (or a single account
// scrape fails) the cron still returns 200 with partial counts. The TikTok
// RapidAPI (RAPIDAPI_KEY) would be the alternative source here but is not
// implemented yet.
// ============================================================
import { ok, err, isAuthorizedCron } from "@/lib/api";
import { admin, nowIso } from "@/lib/supabase";
import { scrapeTikTokProfile } from "@/lib/integrations/scrapers/tiktok";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_ACCOUNTS = 25;

interface AccountRow {
  id: string;
  brand_id: string | null;
  username: string;
  follower_count: number | null;
  warmup_phase: string | null;
}

export async function GET(req: Request) {
  try {
    if (!isAuthorizedCron(req)) return err("unauthorized", 401);

    if (!process.env.LIGHTPANDA_CDP_URL) {
      // FALLBACK (RapidAPI): not implemented — see note above.
      return ok({
        source: "none",
        synced: 0,
        note: "LIGHTPANDA_CDP_URL not set; RapidAPI fallback not implemented",
      });
    }

    const db = admin();
    const { data, error } = await db
      .from("accounts")
      .select("id, brand_id, username, follower_count, warmup_phase")
      .eq("platform", "tiktok")
      .eq("status", "active")
      .limit(MAX_ACCOUNTS);

    if (error) return err(`account load failed: ${error.message}`, 500);
    const accounts = (data ?? []) as AccountRow[];

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    let synced = 0;
    const notes: string[] = [];

    for (const acct of accounts) {
      try {
        const stats = await scrapeTikTokProfile(acct.username);
        if (!stats || stats.followers === undefined) {
          notes.push(`@${acct.username}: no stats`);
          continue;
        }

        const followersStart = acct.follower_count ?? 0;
        const followersEnd = stats.followers;
        const totalViews = (stats.recentViews ?? []).reduce((a, b) => a + b, 0);

        // kpi_metrics is unique on (account_id, date) — upsert that key.
        const { error: kpiErr } = await db.from("kpi_metrics").upsert(
          {
            brand_id: acct.brand_id,
            account_id: acct.id,
            date: today,
            followers_start: followersStart,
            followers_end: followersEnd,
            total_views: totalViews,
            warmup_phase: acct.warmup_phase ?? null,
            recorded_at: nowIso(),
          },
          { onConflict: "account_id,date" },
        );
        if (kpiErr) {
          notes.push(`@${acct.username} kpi: ${kpiErr.message}`);
          continue;
        }

        await db
          .from("accounts")
          .update({ follower_count: followersEnd, last_scraped_at: nowIso() })
          .eq("id", acct.id);

        synced += 1;
      } catch (e) {
        notes.push(`@${acct.username} failed: ${e instanceof Error ? e.message : "error"}`);
      }
    }

    return ok({
      source: "lightpanda",
      synced,
      total: accounts.length,
      note: notes.join(" | ") || "ok",
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "KPI sync cron failed", 500);
  }
}
