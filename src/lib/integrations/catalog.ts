// ============================================================
// Catalog builder — merges the static PROVIDERS registry with the live
// integration_connections rows so both the API route and the hub UI render
// from one source. Degrades gracefully when the DB/env is absent.
// ============================================================
import { admin } from "@/lib/supabase";
import { PROVIDERS, providerConfigured, type ProviderMeta } from "./registry";
import type { IntegrationConnection } from "@/lib/types";

export interface CatalogEntry extends ProviderMeta {
  configured: boolean;
  connection: IntegrationConnection | null;
}

/** Build the full provider catalog with config + connection state. */
export async function buildCatalog(): Promise<CatalogEntry[]> {
  const connections = await loadConnections();
  const byProvider = new Map(connections.map((c) => [c.provider, c]));

  return PROVIDERS.map((meta) => ({
    ...meta,
    configured: providerConfigured(meta),
    connection: byProvider.get(meta.id) ?? null,
  }));
}

async function loadConnections(): Promise<IntegrationConnection[]> {
  try {
    const { data, error } = await admin().from("integration_connections").select("*");
    if (error) return [];
    return (data ?? []) as IntegrationConnection[];
  } catch {
    return [];
  }
}
