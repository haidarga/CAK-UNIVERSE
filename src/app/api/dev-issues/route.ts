// ============================================================
// /api/dev-issues
//   GET  — list dev issues / problem reports.
//          filters: ?status= &severity= &area=
//          joins reporter + assignee (both -> team_members).
//   POST — report a problem { title, description?, severity?, area?, reported_by? }
//          default status "open"; logs activity.
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import {
  DEV_SEVERITY,
  DEV_AREAS,
  type DevSeverity,
  type DevArea,
} from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Dual-FK disambiguated join (both columns FK into team_members).
const JOIN =
  "*, reporter:team_members!dev_issues_reported_by_fkey(*), assignee:team_members!dev_issues_assignee_id_fkey(*)";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const severity = url.searchParams.get("severity");
    const area = url.searchParams.get("area");

    let query = admin()
      .from("dev_issues")
      .select(JOIN)
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (severity) query = query.eq("severity", severity);
    if (area) query = query.eq("area", area);

    const { data, error } = await query;
    if (error) return err(error.message, 500);
    return ok(data ?? []);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list dev issues", 500);
  }
}

interface CreateBody {
  title?: string;
  description?: string | null;
  severity?: DevSeverity;
  area?: DevArea;
  reported_by?: string | null;
}

export async function POST(req: Request) {
  try {
    let body: CreateBody;
    try {
      body = (await req.json()) as CreateBody;
    } catch {
      return err("invalid JSON body", 400);
    }

    if (!body.title || !body.title.trim()) return err("title is required", 400);

    const severity: DevSeverity = (DEV_SEVERITY as readonly string[]).includes(
      body.severity as string,
    )
      ? (body.severity as DevSeverity)
      : "medium";
    const area: DevArea = (DEV_AREAS as readonly string[]).includes(body.area as string)
      ? (body.area as DevArea)
      : "general";

    const { data, error } = await admin()
      .from("dev_issues")
      .insert({
        title: body.title.trim(),
        description: body.description ?? null,
        severity,
        area,
        status: "open",
        reported_by: body.reported_by ?? null,
      })
      .select(JOIN)
      .single();
    if (error) return err(error.message, 500);

    await logActivity({
      actorId: body.reported_by ?? null,
      entityType: "dev_issue",
      entityId: data.id as string,
      action: "created",
      summary: data.title as string,
    });

    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to create dev issue", 500);
  }
}
