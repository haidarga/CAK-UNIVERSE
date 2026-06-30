// ============================================================
// POST /api/agents/lead/decisions — body { brandId }
// The Lead acts as decision-maker: analyzes KPIs + pipeline + account health +
// open issues and returns structured decisions (problem → decision → how to
// solve → owner). Powers the "Decisions & solutions" panel on Reports.
// ============================================================
import { ok, err } from "@/lib/api";
import { LeadAgent } from "@/lib/agents/lead";

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

    const result = await new LeadAgent().generateDecisions(body.brandId);
    if (!result.success) return err(result.error, 500);
    return ok(result.data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Decision generation failed", 500);
  }
}
