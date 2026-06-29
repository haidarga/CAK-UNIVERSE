// ============================================================
// POST /api/integrations/sync  { provider }
// Runs the provider's connector.sync(), then records the outcome on the
// integration_connections row (last_synced_at / last_error / status).
// Returns the raw SyncResult.
// ============================================================
import { admin, nowIso } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { getConnector } from "@/lib/integrations/connectors";
import { getProvider, type ProviderId, type SyncResult } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SyncBody {
  provider?: string;
}

export async function POST(req: Request) {
  try {
    let body: SyncBody;
    try {
      body = (await req.json()) as SyncBody;
    } catch {
      return err("invalid JSON body", 400);
    }

    const provider = body.provider as ProviderId | undefined;
    if (!provider || !getProvider(provider)) {
      return err("valid provider is required", 400);
    }

    const connector = getConnector(provider);
    if (!connector) return err(`no connector for ${provider}`, 400);

    const result: SyncResult = await connector.sync();

    await recordOutcome(provider, result);

    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Sync failed", 500);
  }
}

/** Best-effort write of sync outcome onto the connection row. */
async function recordOutcome(provider: ProviderId, result: SyncResult): Promise<void> {
  try {
    const patch = {
      provider,
      last_synced_at: nowIso(),
      last_error: result.ok ? null : (result.error ?? "sync failed"),
      status: result.ok ? ("connected" as const) : ("error" as const),
      updated_at: nowIso(),
    };

    const db = admin();
    const { data } = await db
      .from("integration_connections")
      .select("id")
      .eq("provider", provider)
      .is("account_label", null)
      .maybeSingle();

    if (data?.id) {
      await db.from("integration_connections").update(patch).eq("id", data.id);
    } else {
      await db.from("integration_connections").insert(patch);
    }
  } catch {
    // Recording the outcome is non-fatal; the SyncResult is still returned.
  }
}
