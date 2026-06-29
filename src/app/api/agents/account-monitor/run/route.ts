// ============================================================
// POST /api/agents/account-monitor/run — body { brandId }
// Triggers AccountMonitorAgent.runDailyScan for a brand.
// ============================================================
import { ok, err } from "@/lib/api";
import { AccountMonitorAgent } from "@/lib/agents/account_monitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  brandId?: string;
}

export async function POST(req: Request) {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return err("invalid JSON body", 400);
    }

    if (!body.brandId) return err("brandId is required", 400);

    const result = await new AccountMonitorAgent().runDailyScan(body.brandId);
    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Account monitor run failed", 500);
  }
}
