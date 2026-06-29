// ============================================================
// GET /api/trends — list trends (optional ?brandId=),
// most relevant first, limited to 50.
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIMIT = 50;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const brandId = searchParams.get("brandId");

    let query = admin().from("trends").select("*");
    if (brandId) query = query.eq("brand_id", brandId);

    const { data, error } = await query
      .order("relevance_score", { ascending: false })
      .limit(LIMIT);

    if (error) return err(error.message, 500);
    return ok(data ?? []);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list trends", 500);
  }
}
