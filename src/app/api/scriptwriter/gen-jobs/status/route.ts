import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?batch_id → job counts for a batch (progress + resume signal).
export async function GET(req: Request) {
  const batchId = new URL(req.url).searchParams.get("batch_id") || "";
  if (!batchId) return err("batch_id required");

  const { data, error } = await admin().from("sw_gen_jobs").select("status").eq("batch_id", batchId);
  if (error) return err(error.message, 500);

  const counts = { pending: 0, running: 0, done: 0, failed: 0 };
  for (const j of data ?? []) if (j.status in counts) counts[j.status as keyof typeof counts]++;
  const total = (data ?? []).length;
  return ok({ ...counts, total, active: counts.pending + counts.running });
}
