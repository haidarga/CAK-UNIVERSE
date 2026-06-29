// ============================================================
// PUT /api/pipeline/[id]/stage — move a pipeline item to a new stage.
// Body: { stage, changed_by? }
// Validates stage against PIPELINE_STAGES, appends to stage_history.
// ============================================================
import { admin, nowIso } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface StageBody {
  stage?: string;
  changed_by?: string;
}

interface StageHistoryEntry {
  stage: string;
  changed_at: string;
  changed_by: string;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return err("pipeline id is required", 400);

    let body: StageBody;
    try {
      body = (await req.json()) as StageBody;
    } catch {
      return err("invalid JSON body", 400);
    }

    const stage = body.stage;
    if (!stage) return err("stage is required", 400);
    if (!PIPELINE_STAGES.includes(stage as PipelineStage)) {
      return err(`invalid stage; must be one of: ${PIPELINE_STAGES.join(", ")}`, 400);
    }

    const db = admin();

    // Read current history, append, write back.
    const { data: current, error: readErr } = await db
      .from("content_pipeline")
      .select("stage_history")
      .eq("id", id)
      .single();
    if (readErr) return err(readErr.message, readErr.code === "PGRST116" ? 404 : 500);

    const history: StageHistoryEntry[] = Array.isArray(current?.stage_history)
      ? (current.stage_history as StageHistoryEntry[])
      : [];

    const entry: StageHistoryEntry = {
      stage,
      changed_at: nowIso(),
      changed_by: body.changed_by ?? "system",
    };

    const { data, error } = await db
      .from("content_pipeline")
      .update({
        stage,
        stage_history: [...history, entry],
        updated_at: nowIso(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) return err(error.message, 500);
    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to update stage", 500);
  }
}
