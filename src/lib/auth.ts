// ============================================================
// Auth + identity. A Supabase auth user maps to a team_members
// row by EMAIL. Role + identity come from that row. There is no
// public signup — accounts are provisioned in Supabase and seeded
// into team_members.
// ============================================================
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { admin } from "./supabase";
import { createServerSupabase } from "./supabase-server";
import type { TeamMember } from "./types";

// Re-export the pure role→route policy so server callers can keep
// importing `canAccess` from "@/lib/auth". The implementation lives
// in ./access (no server-only imports) so client components can use
// it without pulling next/headers into the bundle.
export { canAccess } from "./access";

/**
 * Returns the Supabase auth user from the cookie session, or null.
 * Never throws on missing env — degrades to null so the app still
 * renders in local dev without auth configured.
 */
export async function getSessionUser(): Promise<User | null> {
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolves the signed-in user to a team_members row via email.
 * Returns null when not signed in, env is missing, or no matching
 * member is provisioned.
 */
export async function getCurrentMember(): Promise<TeamMember | null> {
  const user = await getSessionUser();
  const email = user?.email;
  if (!email) return null;

  try {
    const { data, error } = await admin()
      .from("team_members")
      .select("*")
      .ilike("email", email)
      .maybeSingle();
    if (error || !data) return null;
    return data as TeamMember;
  } catch {
    return null;
  }
}

/**
 * Server-side guard: returns the member or redirects to /login.
 * Use in protected server components/layouts.
 */
export async function requireMember(nextPath = "/team"): Promise<TeamMember> {
  const member = await getCurrentMember();
  if (!member) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return member;
}
