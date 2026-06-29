// ============================================================
// GET /api/brands — list all brands ordered by name.
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { data, error } = await admin().from("brands").select("*").order("name", { ascending: true });
    if (error) return err(error.message, 500);
    return ok(data ?? []);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list brands", 500);
  }
}
