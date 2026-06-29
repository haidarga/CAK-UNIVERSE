// ============================================================
// GET /api/cron/github-sync — pulls GitHub issues into dev_issues.
// Guarded by isAuthorizedCron (CRON_SECRET). Runs the GitHub connector.
// ============================================================
import { admin, nowIso } from "@/lib/supabase";
import { ok, err, isAuthorizedCron } from "@/lib/api";
import { getConnector } from "@/lib/integrations/connectors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    if (!isAuthorizedCron(req)) return err("unauthorized", 401);

    const connector = getConnector("github");
    if (!connector) return err("no github connector", 500);

    const result = await connector.sync();

    // Mirror the outcome onto the connection row (best-effort).
    try {
      const db = admin();
      const { data } = await db
        .from("integration_connections")
        .select("id")
        .eq("provider", "github")
        .is("account_label", null)
        .maybeSingle();
      const patch = {
        provider: "github",
        last_synced_at: nowIso(),
        last_error: result.ok ? null : (result.error ?? "sync failed"),
        status: result.ok ? "connected" : "error",
        updated_at: nowIso(),
      };
      if (data?.id) {
        await db.from("integration_connections").update(patch).eq("id", data.id);
      } else {
        await db.from("integration_connections").insert(patch);
      }
    } catch {
      // non-fatal
    }

    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : "GitHub sync cron failed", 500);
  }
}
