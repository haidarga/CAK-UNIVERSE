// ============================================================
// POST /api/agents/lead/generate-report — body { brandId, period? }
// Triggers LeadAgent.generateReport.
// ============================================================
import { ok, err } from "@/lib/api";
import { LeadAgent } from "@/lib/agents/lead";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  brandId?: string;
  period?: string;
}

// Allowlist — never pass arbitrary caller text into the report prompt.
const ALLOWED_PERIODS = ["last 7 days", "last 30 days", "last 90 days"] as const;

export async function POST(req: Request) {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return err("invalid JSON body", 400);
    }

    if (!body.brandId) return err("brandId is required", 400);

    const period =
      body.period && ALLOWED_PERIODS.includes(body.period as (typeof ALLOWED_PERIODS)[number])
        ? body.period
        : "last 30 days";

    const result = await new LeadAgent().generateReport(body.brandId, period);
    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Report generation failed", 500);
  }
}
