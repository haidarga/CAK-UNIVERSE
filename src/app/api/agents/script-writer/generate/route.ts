// ============================================================
// POST /api/agents/script-writer/generate — body { pipelineId, blockType, contextDetails }
// Triggers ScriptWriterAgent.generateBlock.
// ============================================================
import { ok, err } from "@/lib/api";
import { ScriptWriterAgent } from "@/lib/agents/script_writer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  pipelineId?: string;
  blockType?: "hook" | "body" | "cta";
  contextDetails?: string;
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
    if (!body.blockType) return err("blockType is required", 400);

    const result = await new ScriptWriterAgent().generateBlock(body.pipelineId, body.blockType, body.contextDetails || "");
    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Block generation failed", 500);
  }
}
