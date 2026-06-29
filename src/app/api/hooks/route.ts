// ============================================================
// /api/hooks
// GET  — list hooks for a brand (required ?brandId=), best performing first.
// POST — create a hook.
// ============================================================
import { admin, nowIso } from "@/lib/supabase";
import { ok, err } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const brandId = searchParams.get("brandId");
    if (!brandId) return err("brandId is required", 400);

    const { data, error } = await admin()
      .from("hooks")
      .select("*")
      .eq("brand_id", brandId)
      .order("performance_score", { ascending: false });

    if (error) return err(error.message, 500);
    return ok(data ?? []);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list hooks", 500);
  }
}

interface CreateHookBody {
  brand_id?: string;
  hook_text?: string;
  emotional_pillar?: string;
  hook_type?: string;
  language?: string;
  performance_score?: number;
  sourced_from?: string;
}

export async function POST(req: Request) {
  try {
    let body: CreateHookBody;
    try {
      body = (await req.json()) as CreateHookBody;
    } catch {
      return err("invalid JSON body", 400);
    }

    if (!body.brand_id) return err("brand_id is required", 400);
    if (!body.hook_text) return err("hook_text is required", 400);
    if (!body.emotional_pillar) return err("emotional_pillar is required", 400);

    const insert = {
      brand_id: body.brand_id,
      hook_text: body.hook_text,
      emotional_pillar: body.emotional_pillar,
      hook_type: body.hook_type ?? null,
      language: body.language ?? "id",
      performance_score: body.performance_score ?? 0,
      sourced_from: body.sourced_from ?? null,
      created_at: nowIso(),
    };

    const { data, error } = await admin().from("hooks").insert(insert).select().single();
    if (error) return err(error.message, 500);
    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to create hook", 500);
  }
}
