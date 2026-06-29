// ============================================================
// /api/pipeline
// GET  — list pipeline rows for a brand (required ?brandId=, optional ?stage=).
// POST — create a new pipeline item (stage defaults to "briefed").
// ============================================================
import { admin, nowIso } from "@/lib/supabase";
import { ok, err } from "@/lib/api";

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

    const now = nowIso();
    const insert = {
      brand_id: body.brand_id,
      account_id: body.account_id ?? null,
      persona_id: body.persona_id ?? null,
      content_direction: body.content_direction ?? null,
      content_type: body.content_type ?? null,
      emotional_pillar: body.emotional_pillar ?? null,
      stage: "briefed",
      stage_history: [{ stage: "briefed", changed_at: now, changed_by: "system" }],
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
