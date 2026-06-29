// ============================================================
// /api/pipeline
// GET  — list pipeline rows for a brand (required ?brandId=, optional ?stage=).
// POST — create a new pipeline item (stage defaults to "briefed").
// ============================================================
import { admin, nowIso } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const brandId = searchParams.get("brandId");
    const stage = searchParams.get("stage");
    if (!brandId) return err("brandId is required", 400);

    let query = admin().from("content_pipeline").select("*").eq("brand_id", brandId);
    if (stage) query = query.eq("stage", stage);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) return err(error.message, 500);
    return ok(data ?? []);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list pipeline", 500);
  }
}

interface CreatePipelineBody {
  brand_id?: string;
  account_id?: string;
  persona_id?: string;
  content_direction?: unknown;
  content_type?: string;
  emotional_pillar?: string;
  content_format?: string;
  script?: unknown;
  stage?: string;
}

export async function POST(req: Request) {
  try {
    let body: CreatePipelineBody;
    try {
      body = (await req.json()) as CreatePipelineBody;
    } catch {
      return err("invalid JSON body", 400);
    }

    if (!body.brand_id) return err("brand_id is required", 400);

    // Resolve stage:
    //  - explicit `stage` wins (must be valid),
    //  - else "direction_set" when a content_direction is provided (a planned item),
    //  - else fall back to "briefed".
    let stage: PipelineStage;
    if (body.stage) {
      if (!PIPELINE_STAGES.includes(body.stage as PipelineStage)) {
        return err(`invalid stage; must be one of: ${PIPELINE_STAGES.join(", ")}`, 400);
      }
      stage = body.stage as PipelineStage;
    } else if (body.content_direction) {
      stage = "direction_set";
    } else {
      stage = "briefed";
    }

    const now = nowIso();
    const insert = {
      brand_id: body.brand_id,
      account_id: body.account_id ?? null,
      persona_id: body.persona_id ?? null,
      content_direction: body.content_direction ?? null,
      content_type: body.content_type ?? null,
      emotional_pillar: body.emotional_pillar ?? null,
      content_format: body.content_format ?? null,
      script: body.script ?? null,
      stage,
      stage_history: [{ stage, changed_at: now, changed_by: "system" }],
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await admin().from("content_pipeline").insert(insert).select().single();
    if (error) return err(error.message, 500);
    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to create pipeline item", 500);
  }
}
