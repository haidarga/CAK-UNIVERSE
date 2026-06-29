// ============================================================
// GET /api/cron/account-scan — runs the daily account scan for every
// active brand. Guarded by isAuthorizedCron.
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err, isAuthorizedCron } from "@/lib/api";
import { AccountMonitorAgent } from "@/lib/agents/account_monitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface BrandRow {
  id: string;
}

export async function GET(req: Request) {
  try {
    if (!isAuthorizedCron(req)) return err("unauthorized", 401);

    const { data, error } = await admin().from("brands").select("id").eq("status", "active");
    if (error) return err(error.message, 500);

    const brands = (data ?? []) as BrandRow[];
    const agent = new AccountMonitorAgent();

    let scanned = 0;
    let failed = 0;
    const failures: { brandId: string; error: string }[] = [];

    for (const brand of brands) {
      try {
        await agent.runDailyScan(brand.id);
        scanned += 1;
      } catch (e) {
        failed += 1;
        failures.push({ brandId: brand.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return ok({ brands: brands.length, scanned, failed, failures });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Account scan cron failed", 500);
  }
}
