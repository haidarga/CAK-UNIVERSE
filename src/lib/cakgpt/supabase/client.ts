// SHIM (CAKGPT port): browser client delegates to the ecosystem's anon client.
import { browser } from "@/lib/supabase";

export function createBrowserSupabaseClient() {
  return browser();
}
