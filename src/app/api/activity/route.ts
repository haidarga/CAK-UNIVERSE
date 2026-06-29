// ============================================================
// GET /api/activity — cross-team activity feed.
//   ?brandId= (optional filter)  &limit= (default 50)
//   Joins the actor (team_members), newest first.
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const brandId = url.searchParams.get("brandId");
    const limitRaw = Number(url.searchParams.get("limit"));
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : DEFAULT_LIMIT;

    let query = admin()
      .from("activity_log")
      .select("*, actor:team_members(*)")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (brandId) query = query.eq("brand_id", brandId);

    const { data, error } = await query;
    if (error) return err(error.message, 500);
    return ok(data ?? []);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to load activity", 500);
  }
}
