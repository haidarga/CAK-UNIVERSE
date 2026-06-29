// ============================================================
// GET /api/pipeline/[id] — single pipeline row joined with
// brands(*), personas(*), accounts(*).
// ============================================================
import { admin } from "@/lib/supabase";
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
