// ============================================================
// GET   /api/pipeline/[id] — single pipeline row joined with
//                            brands(*), personas(*), accounts(*).
// PATCH /api/pipeline/[id] — update mutable content fields on a row
//                            (script, content_direction, format, pillar,
//                            persona). Stage changes go through /stage.
// ============================================================
import { admin, nowIso } from "@/lib/supabase";
import { ok, err } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return err("pipeline id is required", 400);

    const { data, error } = await admin()
      .from("content_pipeline")
      .select("*, brands(*), personas(*), accounts(*)")
      .eq("id", id)
      .single();

    if (error) return err(error.message, error.code === "PGRST116" ? 404 : 500);
    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to load pipeline item", 500);
  }
}

interface PatchPipelineBody {
  script?: unknown;
  content_direction?: unknown;
  content_type?: string;
  content_format?: string;
  emotional_pillar?: string;
  persona_id?: string | null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return err("pipeline id is required", 400);

    let body: PatchPipelineBody;
    try {
      body = (await req.json()) as PatchPipelineBody;
    } catch {
      return err("invalid JSON body", 400);
    }

    // Only set fields that were actually provided — never clobber with null.
    const update: Record<string, unknown> = { updated_at: nowIso() };
    if (body.script !== undefined) update.script = body.script;
    if (body.content_direction !== undefined) update.content_direction = body.content_direction;
    if (body.content_type !== undefined) update.content_type = body.content_type;
    if (body.content_format !== undefined) update.content_format = body.content_format;
    if (body.emotional_pillar !== undefined) update.emotional_pillar = body.emotional_pillar;
    if (body.persona_id !== undefined) update.persona_id = body.persona_id;

    const { data, error } = await admin()
      .from("content_pipeline")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) return err(error.message, error.code === "PGRST116" ? 404 : 500);
    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to update pipeline item", 500);
  }
}
