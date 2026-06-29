// ============================================================
// GET /api/accounts — list accounts for a brand.
// Required: ?brandId=  Optional: ?phase=
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const brandId = searchParams.get("brandId");
    const phase = searchParams.get("phase");
    if (!brandId) return err("brandId is required", 400);

    let query = admin().from("accounts").select("*").eq("brand_id", brandId);
    if (phase) query = query.eq("warmup_phase", phase);

    const { data, error } = await query.order("username", { ascending: true });
    if (error) return err(error.message, 500);
    return ok(data ?? []);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list accounts", 500);
  }
}
