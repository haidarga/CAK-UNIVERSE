// SHIM (CAKGPT port): the LLM key is resolved by the ecosystem's runLLM from
// env, so CAKGPT no longer needs a per-user key. Return a constant to satisfy
// the signature; callGeminiJSON ignores it.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getGeminiApiKey(_supabase: SupabaseClient, _userId: string): Promise<string> {
  return "ecosystem-managed";
}
