// ============================================================
// POST /api/agents/head-of-creator/qc — body { pipelineId, videoDescription }
// Triggers HeadOfCreatorAgent.qcVideo.
// ============================================================
import { ok, err } from "@/lib/api";
import { HeadOfCreatorAgent } from "@/lib/agents/head_of_creator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  pipelineId?: string;
  videoDescription?: string;
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
    if (!body.videoDescription) return err("videoDescription is required", 400);
    // Bound free-text before it flows into an LLM prompt (injection/cost guard).
    const videoDescription = body.videoDescription.slice(0, 2000);

    const result = await new HeadOfCreatorAgent().qcVideo(body.pipelineId, videoDescription);
    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : "QC review failed", 500);
  }
}
