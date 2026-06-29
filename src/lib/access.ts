// ============================================================
// Role → route policy. PURE module — no server-only imports
// (next/headers, supabase admin). Safe to import from client
// components (e.g. nav.tsx) AND server code.
//
// Policy:
//   - lead / admin        → everything (short-circuited).
//   - everyone (auth'd)   → COMMON_PREFIXES.
//   - otherwise           → the role's own allowed prefixes.
// ============================================================
import type { TeamRole } from "./constants";

/** Prefixes every authenticated member can reach regardless of role. */
const COMMON_PREFIXES: readonly string[] = ["/tasks", "/team", "/activity"];

/** Per-role allowed route prefixes (additive to COMMON_PREFIXES). */
const ROLE_ROUTES: Record<TeamRole, readonly string[]> = {
  lead: ["/"], // full access (also short-circuited below)
  admin: ["/"], // full access (also short-circuited below)
  strategist: ["/studio/strategy", "/accounts", "/pipeline", "/scripts", "/reports"],
  script_writer: ["/studio/script", "/scripts"],
  creator: ["/studio/creator"],
  head_of_creator: ["/studio/qc", "/qc", "/accounts", "/pipeline", "/scripts", "/reports"],
  account_monitor: ["/accounts", "/pipeline", "/reports"],
  developer: ["/dev", "/integrations", "/activity"],
};

/** Roles with unconditional access to every route. */
const FULL_ACCESS_ROLES: readonly TeamRole[] = ["lead", "admin"];

/** Returns true if `role` may access `path`. */
export function canAccess(role: TeamRole, path: string): boolean {
  if (FULL_ACCESS_ROLES.includes(role)) return true;

  const allowed = [...COMMON_PREFIXES, ...(ROLE_ROUTES[role] ?? [])];
  return allowed.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
