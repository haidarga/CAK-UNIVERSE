import { admin, nowIso } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { generateNaskah } from "@/lib/scriptwriter/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CHUNK = 12;
const MAX_ATTEMPTS = 3;

interface Job { id: string; brand_id: string; brief_id: string; persona_id: string | null; attempts: number }

// POST { batch_id } → claim up to CHUNK pending jobs, run them (1 LLM call each,
// critic skipped in bulk), update status. Returns { remaining } so the client
// keeps pumping. Safe to call concurrently (RPC uses FOR UPDATE SKIP LOCKED).
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err("invalid json"); }
  const batchId = String(body.batch_id || "");
  if (!batchId) return err("batch_id required");

  const db = admin();
  const { data: claimed, error: claimErr } = await db.rpc("sw_claim_gen_jobs", { p_batch_id: batchId, p_limit: CHUNK });
  if (claimErr) return err(claimErr.message, 500);
  const jobs = (claimed ?? []) as Job[];

  let done = 0;
  let failed = 0;
  await Promise.all(jobs.map(async (job) => {
    try {
      const res = await generateNaskah({ brandId: job.brand_id, batchId, briefId: job.brief_id, personaId: job.persona_id || undefined, skipCritic: true });
      if (res.ok) {
        await db.from("sw_gen_jobs").update({ status: "done", naskah_id: res.naskahId, error: null, updated_at: nowIso() }).eq("id", job.id);
        done++;
      } else {
        const giveUp = job.attempts >= MAX_ATTEMPTS;
        await db.from("sw_gen_jobs").update({ status: giveUp ? "failed" : "pending", error: res.error, updated_at: nowIso() }).eq("id", job.id);
        if (giveUp) failed++;
      }
    } catch (e) {
      const giveUp = job.attempts >= MAX_ATTEMPTS;
      await db.from("sw_gen_jobs").update({ status: giveUp ? "failed" : "pending", error: e instanceof Error ? e.message : "job threw", updated_at: nowIso() }).eq("id", job.id);
      if (giveUp) failed++;
    }
  }));

  const { count: remaining } = await db.from("sw_gen_jobs").select("id", { count: "exact", head: true }).eq("batch_id", batchId).in("status", ["pending", "running"]);
  return ok({ claimed: jobs.length, done, failed, remaining: remaining ?? 0 });
}
