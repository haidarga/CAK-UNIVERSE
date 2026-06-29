// ============================================================
// POST /api/agents/script-writer/generate — body { pipelineId }
// Triggers ScriptWriterAgent.generateScript.
// ============================================================
import { ok, err } from "@/lib/api";
import { ScriptWriterAgent } from "@/lib/agents/script_writer";

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

    const result = await new ScriptWriterAgent().generateScript(body.pipelineId);
    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Script generation failed", 500);
  }
}
