// SHIM (CAKGPT port): both clients delegate to the ecosystem's service-role
// `admin()` client. The ecosystem runs single-tenant with RLS OFF, so the
// service client is correct for every read/write. Signatures match CAKGPT so
// all ported pages/routes work unchanged.
import { admin } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function createServerClient(): Promise<SupabaseClient> {
  return admin();
}

export function createServiceClient(): SupabaseClient {
  return admin();
}
