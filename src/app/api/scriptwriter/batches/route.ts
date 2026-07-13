import { admin, nowIso } from "@/lib/supabase";
import { ok, err } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { brand_id, name? } → create a generation batch (= one Google Doc).
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err("invalid json"); }
  const brandId = String(body.brand_id || "");
  if (!brandId) return err("brand_id required");
  const name = String(body.name || "").trim() || `Content plan ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

  const { data, error } = await admin()
    .from("sw_batches").insert({ brand_id: brandId, name, updated_at: nowIso() }).select("*").single();
  if (error) return err(error.message, 500);
  return ok({ batch: data });
}
