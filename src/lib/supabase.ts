// ============================================================
// Supabase clients.
// - admin(): service-role, SERVER ONLY. Bypasses RLS. Use in agents/API.
// - browser(): anon key, safe for client components.
// ============================================================
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

/** Service-role client. Never import this into a client component. */
export function admin(): SupabaseClient {
  if (!_admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
    }
    _admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

let _browser: SupabaseClient | null = null;

/** Anon client for browser usage. */
export function browser(): SupabaseClient {
  if (!_browser) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
    }
    _browser = createClient(url, key);
  }
  return _browser;
}

/** Current UTC timestamp as ISO string — use instead of SQL "NOW()" in JS updates. */
export function nowIso(): string {
  return new Date().toISOString();
}
