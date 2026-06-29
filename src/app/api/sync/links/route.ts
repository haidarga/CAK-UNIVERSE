// ============================================================
// /api/sync/links
//   GET    — list sync_links filtered by ?pipelineId= or ?brandId=.
//   POST   — link a Google Doc/Sheet URL to a pipeline/brand, then run
//            an initial syncLink() once. Body: { url, pipelineId?,
//            brandId?, field?, range? }.
//   DELETE — remove a link by ?id=.
// ============================================================
import { admin, nowIso } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { parseGoogleUrl, syncLink } from "@/lib/integrations/google/sync";
import type { SyncLink } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const pipelineId = searchParams.get("pipelineId");
    const brandId = searchParams.get("brandId");

    let q = admin().from("sync_links").select("*").order("created_at", { ascending: false });
    if (pipelineId) q = q.eq("pipeline_id", pipelineId);
    if (brandId) q = q.eq("brand_id", brandId);

    const { data, error } = await q;
    if (error) return err(error.message, 500);
    return ok((data ?? []) as SyncLink[]);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list links", 500);
  }
}

interface CreateBody {
  url?: string;
  pipelineId?: string | null;
  brandId?: string | null;
  field?: string | null;
  range?: string | null;
}

export async function POST(req: Request) {
  try {
    let body: CreateBody;
    try {
      body = (await req.json()) as CreateBody;
    } catch {
      return err("invalid JSON body", 400);
    }

    if (!body.url) return err("url is required", 400);
    const parsed = parseGoogleUrl(body.url);
    if (!parsed) return err("not a Google Docs or Sheets URL", 400);

    const row = {
      kind: parsed.kind,
      external_id: parsed.id,
      external_url: body.url,
      pipeline_id: body.pipelineId ?? null,
      brand_id: body.brandId ?? null,
      field: body.field ?? "script",
      range: body.range ?? null,
      status: "active",
      updated_at: nowIso(),
    };

    const { data, error } = await admin().from("sync_links").insert(row).select("*").single();
    if (error) return err(error.message, 500);

    // Run one initial sync so the link lands with fresh markers.
    const result = await syncLink(data as SyncLink);

    return ok({ link: data as SyncLink, sync: result });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to create link", 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return err("id is required", 400);

    const { error } = await admin().from("sync_links").delete().eq("id", id);
    if (error) return err(error.message, 500);
    return ok({ id });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to delete link", 500);
  }
}
