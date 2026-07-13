import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?brand_id&batch_id&status=draft → triage queue: riskiest first.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const brandId = sp.get("brand_id") || "";
  const batchId = sp.get("batch_id") || "";
  const status = sp.get("status") || "draft";
  if (!brandId) return err("brand_id required");

  const db = admin();
  let q = db.from("sw_naskah").select("id, title, status, current_version_id, updated_at, persona_id").eq("brand_id", brandId).eq("status", status).order("updated_at", { ascending: false }).limit(300);
  if (batchId) q = q.eq("batch_id", batchId);
  const { data: rows, error } = await q;
  if (error) return err(error.message, 500);
  if (!rows || rows.length === 0) return ok({ items: [] });

  const versionIds = rows.map((n) => n.current_version_id).filter(Boolean) as string[];
  const personaIds = [...new Set(rows.map((n) => n.persona_id).filter(Boolean))] as string[];

  const [{ data: versions }, { data: flags }, { data: personas }] = await Promise.all([
    versionIds.length ? db.from("sw_naskah_versions").select("id, hook_type").in("id", versionIds) : Promise.resolve({ data: [] }),
    versionIds.length ? db.from("sw_qc_flags").select("naskah_version_id, severity").eq("status", "open").in("naskah_version_id", versionIds) : Promise.resolve({ data: [] }),
    personaIds.length ? db.from("personas").select("id, name").in("id", personaIds) : Promise.resolve({ data: [] }),
  ]);

  const hookByVersion = new Map((versions ?? []).map((v: { id: string; hook_type: string | null }) => [v.id, v.hook_type]));
  const personaName = new Map((personas ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));
  const flagsByVersion = new Map<string, { blocker: number; warning: number; nit: number }>();
  for (const f of (flags ?? []) as { naskah_version_id: string; severity: string }[]) {
    const c = flagsByVersion.get(f.naskah_version_id) ?? { blocker: 0, warning: 0, nit: 0 };
    if (f.severity in c) c[f.severity as keyof typeof c]++;
    flagsByVersion.set(f.naskah_version_id, c);
  }

  const items = rows.map((n) => {
    const fc = (n.current_version_id ? flagsByVersion.get(n.current_version_id) : null) ?? { blocker: 0, warning: 0, nit: 0 };
    return {
      naskah_id: n.id,
      title: n.title,
      updated_at: n.updated_at,
      persona_name: n.persona_id ? personaName.get(n.persona_id) ?? null : null,
      hook_type: n.current_version_id ? hookByVersion.get(n.current_version_id) ?? null : null,
      flag_counts: fc,
      has_open_blockers: fc.blocker > 0,
    };
  });
  items.sort((a, b) => (a.has_open_blockers !== b.has_open_blockers ? (a.has_open_blockers ? -1 : 1) : b.flag_counts.blocker - a.flag_counts.blocker || (a.updated_at < b.updated_at ? 1 : -1)));
  return ok({ items });
}
