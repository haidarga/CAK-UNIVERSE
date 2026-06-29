// ============================================================
// SSR Supabase client — cookie-bound, for Server Components,
// Route Handlers, and Server Actions. Uses the ANON key + the
// signed-in user's session cookies (NOT service-role).
//
// Next 15: cookies() is async.
// Reference: @supabase/ssr Next.js App Router pattern.
// ============================================================
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Cookie-based server client. Reads/writes the auth session via
 * Next's cookie store. Safe to call in Server Components (writes
 * are wrapped in try/catch because RSCs cannot set cookies — the
 * middleware refreshes the session there instead).
 */
export async function createServerSupabase(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component where cookies are read-only.
          // Session refresh is handled by middleware, so this is safe to ignore.
        }
      },
    },
  });
}
