// ============================================================
// /api/embeds
//   GET  — list embedded_resources, filtered by ?taskId= &pipelineId= &brandId=
//   POST — attach an external resource:
//          { provider, kind, external_url, title?, brand_id?, task_id?,
//            pipeline_id?, external_id?, thumbnail_url? }
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { getProvider, type ProviderId } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KINDS = ["doc", "sheet", "drive_file", "video", "post", "profile", "board"] as const;
type EmbedKind = (typeof KINDS)[number];

/** Only http(s) — blocks javascript:/data: URLs that would be XSS in an <a href>. */
function isHttpUrl(u: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(u).protocol);
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const taskId = url.searchParams.get("taskId");
    const pipelineId = url.searchParams.get("pipelineId");
    const brandId = url.searchParams.get("brandId");

    let query = admin()
      .from("embedded_resources")
      .select("*")
      .order("created_at", { ascending: false });

    if (taskId) query = query.eq("task_id", taskId);
    if (pipelineId) query = query.eq("pipeline_id", pipelineId);
    if (brandId) query = query.eq("brand_id", brandId);

    const { data, error } = await query;
    if (error) return err(error.message, 500);
    return ok(data ?? []);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list embeds", 500);
  }
}

interface CreateBody {
  provider?: string;
  kind?: string;
  external_url?: string;
  title?: string | null;
  external_id?: string | null;
  thumbnail_url?: string | null;
  brand_id?: string | null;
  task_id?: string | null;
  pipeline_id?: string | null;
  created_by?: string | null;
}

export async function POST(req: Request) {
  try {
    let body: CreateBody;
    try {
      body = (await req.json()) as CreateBody;
    } catch {
      return err("invalid JSON body", 400);
    }

    if (!body.provider || !getProvider(body.provider as ProviderId)) {
      return err("valid provider is required", 400);
    }
    const externalUrl = (body.external_url ?? "").trim();
    if (!externalUrl) return err("external_url is required", 400);
    if (!isHttpUrl(externalUrl)) return err("external_url must be a valid http(s) URL", 400);
    if (body.thumbnail_url && !isHttpUrl(body.thumbnail_url)) {
      return err("thumbnail_url must be a valid http(s) URL", 400);
    }
    if (!body.kind || !(KINDS as readonly string[]).includes(body.kind)) {
      return err(`kind must be one of: ${KINDS.join(", ")}`, 400);
    }

    const row = {
      provider: body.provider,
      kind: body.kind as EmbedKind,
      external_url: externalUrl,
      title: body.title ?? null,
      external_id: body.external_id ?? null,
      thumbnail_url: body.thumbnail_url ?? null,
      brand_id: body.brand_id ?? null,
      task_id: body.task_id ?? null,
      pipeline_id: body.pipeline_id ?? null,
      created_by: body.created_by ?? null,
    };

    const { data, error } = await admin()
      .from("embedded_resources")
      .insert(row)
      .select("*")
      .single();
    if (error) return err(error.message, 500);
    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to create embed", 500);
  }
}

// AUTHZ: single-org internal tool — any authenticated member may unlink any
// embed (same model as brands). Revisit (RLS / brand-scoping) if multi-tenant.
export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return err("id is required", 400);
    const { error } = await admin().from("embedded_resources").delete().eq("id", id);
    if (error) return err(error.message, 500);
    return ok({ id });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to delete embed", 500);
  }
}
