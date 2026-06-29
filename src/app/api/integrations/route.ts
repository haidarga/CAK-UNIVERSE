// ============================================================
// /api/integrations
//   GET  — full provider catalog: each PROVIDERS entry merged with its
//          integration_connections row + `configured` (env present?).
//          Shape: { providers: [{ ...meta, configured, connection }] }
//   POST — upsert a connection { provider, display_name?, account_label?,
//          status?, config? } into integration_connections.
// ============================================================
import { admin, nowIso } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { buildCatalog } from "@/lib/integrations/catalog";
import { getProvider, type ProviderId } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const providers = await buildCatalog();
    return ok({ providers });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to load integrations", 500);
  }
}

interface UpsertBody {
  provider?: string;
  display_name?: string | null;
  account_label?: string | null;
  status?: "connected" | "disconnected" | "error";
  config?: Record<string, unknown>;
}

export async function POST(req: Request) {
  try {
    let body: UpsertBody;
    try {
      body = (await req.json()) as UpsertBody;
    } catch {
      return err("invalid JSON body", 400);
    }

    if (!body.provider || !getProvider(body.provider as ProviderId)) {
      return err("valid provider is required", 400);
    }

    const accountLabel = body.account_label ?? null;
    const row = {
      provider: body.provider,
      display_name: body.display_name ?? null,
      account_label: accountLabel,
      status: body.status ?? "connected",
      config: body.config ?? {},
      updated_at: nowIso(),
    };

    // Unique key is (provider, account_label). Emulate upsert via lookup
    // since account_label may be null (NULLs are distinct in unique indexes).
    const db = admin();
    let existingId: string | null = null;
    {
      let q = db.from("integration_connections").select("id").eq("provider", body.provider);
      q = accountLabel === null ? q.is("account_label", null) : q.eq("account_label", accountLabel);
      const { data } = await q.maybeSingle();
      existingId = (data?.id as string | undefined) ?? null;
    }

    const { data, error } = existingId
      ? await db
          .from("integration_connections")
          .update(row)
          .eq("id", existingId)
          .select("*")
          .single()
      : await db.from("integration_connections").insert(row).select("*").single();

    if (error) return err(error.message, 500);
    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to upsert connection", 500);
  }
}
