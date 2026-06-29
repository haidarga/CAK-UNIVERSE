// ============================================================
// /api/team
//   GET  — all team members, ordered by role.
//   POST — create a member { name, role, email? }.
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { TEAM_ROLES, type TeamRole } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { data, error } = await admin()
      .from("team_members")
      .select("*")
      .order("role", { ascending: true });
    if (error) return err(error.message, 500);
    return ok(data ?? []);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list team", 500);
  }
}

interface CreateBody {
  name?: string;
  role?: TeamRole;
  email?: string | null;
}

export async function POST(req: Request) {
  try {
    let body: CreateBody;
    try {
      body = (await req.json()) as CreateBody;
    } catch {
      return err("invalid JSON body", 400);
    }

    if (!body.name || !body.name.trim()) return err("name is required", 400);
    const role: TeamRole = (TEAM_ROLES as readonly string[]).includes(body.role as string)
      ? (body.role as TeamRole)
      : "strategist";

    const { data, error } = await admin()
      .from("team_members")
      .insert({ name: body.name.trim(), role, email: body.email ?? null })
      .select("*")
      .single();
    if (error) return err(error.message, 500);

    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to create team member", 500);
  }
}
