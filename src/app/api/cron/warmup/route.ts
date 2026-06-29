// ============================================================
// GET /api/cron/warmup — scheduled warmup runner.
// Loads active accounts, filters with isWarmupDue, and runs a
// warmup session for each due account (capped per invocation to
// bound LLM + browser cost). Guarded by isAuthorizedCron.
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err, isAuthorizedCron } from "@/lib/api";
import { isWarmupDue } from "@/lib/warmup/planner";
import { runWarmupSession } from "@/lib/warmup/executor";
import type { Account } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Max accounts to warm per cron tick — bounds cost on big fleets. */
const MAX_PER_RUN = 20;

export async function GET(req: Request) {
  try {
    if (!isAuthorizedCron(req)) return err("unauthorized", 401);

    const db = admin();
    const { data, error } = await db.from("accounts").select("*").eq("status", "active");
    if (error) return err(error.message, 500);

    const accounts = (data ?? []) as Account[];
    const now = Date.now();
    const due = accounts.filter((a) => {
      const enabled = (a as Account & { warmup_enabled?: boolean }).warmup_enabled;
      if (enabled === false) return false;
      return isWarmupDue(a, now);
    });

    const batch = due.slice(0, MAX_PER_RUN);

    // Sequential to avoid hammering a single shared Lightpanda server.
    const results: { accountId: string; ok: boolean; status: string | null; error?: string }[] = [];
    for (const account of batch) {
      const res = await runWarmupSession(account.id);
      results.push({
        accountId: account.id,
        ok: res.ok,
        status: res.run?.status ?? null,
        ...(res.error ? { error: res.error } : {}),
      });
    }

    return ok({ due: due.length, ran: batch.length, results });
  } catch (e) {
    return err(e instanceof Error ? e.message : "warmup cron failed", 500);
  }
}
