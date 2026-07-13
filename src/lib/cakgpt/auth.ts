// SHIM (CAKGPT port): the ecosystem middleware already authenticates every
// request, and CAKGPT here runs single-tenant. So auth resolves to one fixed
// workspace user id (used as created_by on every row). Signatures unchanged.
import type { SupabaseClient, User } from "@supabase/supabase-js";

// Fixed single-tenant workspace owner. Every CAKGPT row's created_by = this.
export const SW_USER_ID = "00000000-0000-4000-8000-000000000001";

export async function requireUser(_supabase: SupabaseClient) {
  return { user: { id: SW_USER_ID } as User, unauthorized: null as null };
}

export async function requirePageUser(_supabase: SupabaseClient): Promise<User> {
  return { id: SW_USER_ID } as User;
}
