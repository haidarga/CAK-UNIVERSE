// ============================================================
// GET /api/warmup/runs?accountId= — recent warmup sessions for an
// account (newest first, max 20) each with its action count.
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import type { WarmupRun } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIMIT = 20;

export async function GET(req: Request) {
  try {
    const accountId = new URL(req.url).searchParams.get("accountId")?.trim();
    if (!accountId) return err("accountId is required");

    const db = admin();
    const { data, error } = await db
      .from("warmup_runs")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (error) return err(error.message, 500);

    const runs = (data ?? []) as WarmupRun[];

    // Attach an action count per run (best-effort, parallel).
    const withCounts = await Promise.all(
      runs.map(async (run) => {
        const { count } = await db
          .from("warmup_actions")
          .select("id", { count: "exact", head: true })
          .eq("run_id", run.id);
        return { ...run, actions_count: count ?? 0 };
      }),
    );

    return ok(withCounts);
  } catch (e) {
    return err(e instanceof Error ? e.message : "failed to load warmup runs", 500);
  }
}
