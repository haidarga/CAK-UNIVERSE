import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Item { brief_id: string; persona_id?: string | null }

// POST { brand_id, batch_id, items:[{brief_id, persona_id?}] } → ENQUEUE one job
// per (brief × persona). Returns instantly; the client pumps /gen-jobs/process.
// Deduped against existing jobs so retries are idempotent.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err("invalid json"); }
  const brandId = String(body.brand_id || "");
  const batchId = String(body.batch_id || "");
  if (!brandId || !batchId) return err("brand_id and batch_id required");
  const items = (Array.isArray(body.items) ? body.items : []) as Item[];
  if (items.length === 0) return err("items required: [{ brief_id, persona_id? }]");
  if (items.length > 4000) return err(`too many items (${items.length}) — max 4000 per run`);

  const db = admin();
  const key = (b: string, p: string | null | undefined) => `${b}|${p ?? ""}`;
  const { data: existing } = await db.from("sw_gen_jobs").select("brief_id, persona_id").eq("batch_id", batchId);
  const seen = new Set((existing ?? []).map((j: { brief_id: string; persona_id: string | null }) => key(j.brief_id, j.persona_id)));

  const rows = items
    .filter((it) => it && it.brief_id && !seen.has(key(it.brief_id, it.persona_id)))
    .map((it) => ({ brand_id: brandId, batch_id: batchId, brief_id: it.brief_id, persona_id: it.persona_id ?? null, status: "pending" as const }));
  if (rows.length === 0) return ok({ enqueued: 0, batch_id: batchId });

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from("sw_gen_jobs").insert(rows.slice(i, i + CHUNK));
    if (error) return err(`failed to enqueue: ${error.message}`, 500);
  }
  return ok({ enqueued: rows.length, batch_id: batchId });
}
