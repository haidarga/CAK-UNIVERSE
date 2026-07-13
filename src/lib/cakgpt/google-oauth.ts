// SHIM (CAKGPT port): Google auth is owned by the ecosystem's integration
// (connect once under Integrations). getValidAccessToken delegates to the
// ecosystem's token store; CAKGPT's own OAuth flow is unused here.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGoogleAccessToken } from "@/lib/integrations/google/client";

export async function getValidAccessToken(_supabase: SupabaseClient, _userId: string): Promise<string> {
  const token = await getGoogleAccessToken();
  if (!token) throw new Error("Google account not connected — connect it under Integrations first");
  return token;
}

// Unused in the ecosystem (OAuth handled by /api/integrations/google/*), kept
// only so any stray import still type-checks.
export function buildGoogleAuthUrl(_state: string): string {
  return "/api/integrations/google/auth";
}
export async function exchangeCodeForTokens(_code: string): Promise<never> {
  throw new Error("OAuth is handled by the ecosystem Integrations flow");
}
