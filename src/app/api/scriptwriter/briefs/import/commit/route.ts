import { admin, nowIso } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import type { ImportedBrief } from "@/lib/scriptwriter/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { brand_id, briefs: ImportedBrief[], import_label?, status? } → bulk-insert.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err("invalid json"); }
  const brandId = String(body.brand_id || "");
  if (!brandId) return err("brand_id required");
  const briefs = Array.isArray(body.briefs) ? (body.briefs as ImportedBrief[]) : [];
  if (briefs.length === 0) return err("briefs required (non-empty array)");
  if (briefs.length > 300) return err("max 300 briefs per import");
  const status = body.status === "draft" ? "draft" : "ready";
  const importGroup = typeof body.import_label === "string" && body.import_label.trim() ? body.import_label.trim().slice(0, 200) : null;

  const rows = briefs
    .filter((b) => b && typeof b.title === "string" && b.title.trim())
    .map((b) => ({
      brand_id: brandId,
      title: String(b.title).slice(0, 200),
      product: b.product ? String(b.product).slice(0, 200) : null,
      platform: b.platform ? String(b.platform).slice(0, 40) : null,
      fields: b.fields && typeof b.fields === "object" ? b.fields : {},
      status,
      import_group: importGroup,
      updated_at: nowIso(),
    }));
  if (rows.length === 0) return err("no valid briefs");

  const { data, error } = await admin().from("sw_briefs").insert(rows).select("id");
  if (error) return err(error.message, 500);
  return ok({ brief_ids: (data ?? []).map((r: { id: string }) => r.id), count: data?.length ?? 0 });
}
