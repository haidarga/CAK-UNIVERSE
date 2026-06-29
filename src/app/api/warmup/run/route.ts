// ============================================================
// POST /api/warmup/run — { accountId } → run one warmup session.
// Returns the persisted warmup_runs row (simulated or live).
// ============================================================
import { ok, err } from "@/lib/api";
import { runWarmupSession } from "@/lib/warmup/executor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { accountId?: string; minutes?: number };
    const accountId = body.accountId?.trim();
    if (!accountId) return err("accountId is required");

    const minutes =
      typeof body.minutes === "number" && body.minutes > 0 ? Math.min(120, body.minutes) : undefined;

    const result = await runWarmupSession(accountId, { targetMinutes: minutes });
    if (!result.ok) return err(result.error ?? "warmup failed", 500);

    return ok(result.run);
  } catch (e) {
    return err(e instanceof Error ? e.message : "warmup run failed", 500);
  }
}
