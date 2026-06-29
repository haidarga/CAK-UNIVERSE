// ============================================================
// GET /api/accounts/[id]/metrics — kpi_metrics for an account,
// last 30 days, newest first.
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return err("account id is required", 400);

    const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString().slice(0, 10);

    const { data, error } = await admin()
      .from("kpi_metrics")
      .select("*")
      .eq("account_id", id)
      .gte("date", since)
      .order("date", { ascending: false });

    if (error) return err(error.message, 500);
    return ok(data ?? []);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to load metrics", 500);
  }
}
