// ============================================================
// GET /api/cron/google-sync — reconcile all active sync links.
// Guarded by isAuthorizedCron (CRON_SECRET). No-ops gracefully when
// Google is not connected. Caps at 50 links per run.
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err, isAuthorizedCron } from "@/lib/api";
import { googleConnected } from "@/lib/integrations/google/client";
import { syncLink, type SyncOutcome } from "@/lib/integrations/google/sync";
import type { SyncLink } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_LINKS = 50;

export async function GET(req: Request) {
  try {
    if (!isAuthorizedCron(req)) return err("unauthorized", 401);

    const status = await googleConnected();
    if (!status.connected) {
      return ok({ synced: 0, note: "google not connected" });
    }

    const { data, error } = await admin()
      .from("sync_links")
      .select("*")
      .eq("status", "active")
      .order("last_synced_at", { ascending: true, nullsFirst: true })
      .limit(MAX_LINKS);
    if (error) return err(error.message, 500);

    const links = (data ?? []) as SyncLink[];
    const results: { id: string; outcome: SyncOutcome }[] = [];
    let pulled = 0;
    let pushed = 0;
    let conflicts = 0;
    let errors = 0;

    for (const link of links) {
      const outcome = await syncLink(link);
      results.push({ id: link.id, outcome });
      if (outcome.direction === "pull") pulled++;
      else if (outcome.direction === "push") pushed++;
      else if (outcome.direction === "conflict") conflicts++;
      if (outcome.status === "error") errors++;
    }

    return ok({
      synced: links.length,
      pulled,
      pushed,
      conflicts,
      errors,
      results,
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Google sync cron failed", 500);
  }
}
