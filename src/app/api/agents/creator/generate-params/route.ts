// ============================================================
// POST /api/agents/creator/generate-params — body { pipelineId }
// Triggers CreatorAgent.generateProductionParams.
// ============================================================
import { ok, err } from "@/lib/api";
import { CreatorAgent } from "@/lib/agents/creator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  pipelineId?: string;
}

export async function POST(req: Request) {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return err("invalid JSON body", 400);
    }

    if (!body.pipelineId) return err("pipelineId is required", 400);

    const result = await new CreatorAgent().generateProductionParams(body.pipelineId);
    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Production params generation failed", 500);
  }
}
