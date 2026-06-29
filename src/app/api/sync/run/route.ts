// ============================================================
// POST /api/sync/run — reconcile a single sync link now.
// Body: { linkId }. Loads the link, runs syncLink(), returns outcome.
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { syncLink } from "@/lib/integrations/google/sync";
import type { SyncLink } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RunBody {
  linkId?: string;
}

export async function POST(req: Request) {
  try {
    let body: RunBody;
    try {
      body = (await req.json()) as RunBody;
    } catch {
      return err("invalid JSON body", 400);
    }

    if (!body.linkId) return err("linkId is required", 400);

    const { data, error } = await admin()
      .from("sync_links")
      .select("*")
      .eq("id", body.linkId)
      .maybeSingle();
    if (error) return err(error.message, 500);
    if (!data) return err("link not found", 404);

    const result = await syncLink(data as SyncLink);
    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to run sync", 500);
  }
}
