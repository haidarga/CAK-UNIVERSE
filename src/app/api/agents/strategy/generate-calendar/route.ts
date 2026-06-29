// ============================================================
// POST /api/agents/strategy/generate-calendar — body { brandId }
// Triggers StrategyAgent.generateCalendar.
// ============================================================
import { ok, err } from "@/lib/api";
import { StrategyAgent } from "@/lib/agents/strategy";

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

    const result = await new StrategyAgent().generateCalendar(body.brandId);
    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Calendar generation failed", 500);
  }
}
