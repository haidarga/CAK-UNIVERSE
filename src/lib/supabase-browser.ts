// ============================================================
// SSR Supabase client — browser variant. Use inside client
// components for auth actions (signInWithPassword, signOut, etc).
// Backed by the anon key + cookie-synced session.
// ============================================================
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/** Singleton browser client bound to the public anon key. */
export function createBrowserSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  }

  _client = createBrowserClient(url, key);
  return _client;
}
