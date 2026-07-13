import { admin, nowIso } from "@/lib/supabase";
import { ok, err } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { brand_id, batch_id?, threshold } — approve clean drafts.
// threshold 'none' = zero open flags; 'blocker_only' = no open blocker.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err("invalid json"); }
  const brandId = String(body.brand_id || "");
  if (!brandId) return err("brand_id required");
  const batchId = body.batch_id ? String(body.batch_id) : null;
  const threshold = body.threshold === "blocker_only" ? "blocker_only" : "none";

  const db = admin();
  let q = db.from("sw_naskah").select("id, current_version_id").eq("brand_id", brandId).eq("status", "draft");
  if (batchId) q = q.eq("batch_id", batchId);
  const { data: drafts, error } = await q;
  if (error) return err(error.message, 500);
  if (!drafts || drafts.length === 0) return ok({ approved: 0, skipped: 0 });

  const versionIds = drafts.map((d) => d.current_version_id).filter(Boolean) as string[];
  const { data: openFlags } = versionIds.length
    ? await db.from("sw_qc_flags").select("naskah_version_id, severity").eq("status", "open").in("naskah_version_id", versionIds)
    : { data: [] };
  const byVersion = new Map<string, string[]>();
  for (const f of (openFlags ?? []) as { naskah_version_id: string; severity: string }[]) {
    const l = byVersion.get(f.naskah_version_id) ?? [];
    l.push(f.severity);
    byVersion.set(f.naskah_version_id, l);
  }

  const eligible = drafts
    .filter((n) => {
      const sev = n.current_version_id ? byVersion.get(n.current_version_id) ?? [] : [];
      return threshold === "blocker_only" ? !sev.includes("blocker") : sev.length === 0;
    })
    .map((n) => n.id);
  if (eligible.length === 0) return ok({ approved: 0, skipped: drafts.length });

  const { error: upErr } = await db.from("sw_naskah").update({ status: "approved", updated_at: nowIso() }).in("id", eligible);
  if (upErr) return err(upErr.message, 500);
  return ok({ approved: eligible.length, skipped: drafts.length - eligible.length });
}
