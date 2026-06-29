// ============================================================
// PATCH /api/dev-issues/[id]
//   Update status / severity / area / assignee_id / task_id / description.
//   Logs the change to the activity feed.
// ============================================================
import { admin, nowIso } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import type { DevIssueStatus, DevSeverity, DevArea } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JOIN =
  "*, reporter:team_members!dev_issues_reported_by_fkey(*), assignee:team_members!dev_issues_assignee_id_fkey(*)";

interface PatchBody {
  status?: DevIssueStatus;
  severity?: DevSeverity;
  area?: DevArea;
  assignee_id?: string | null;
  task_id?: string | null;
  description?: string | null;
  actor_id?: string | null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    let body: PatchBody;
    try {
      body = (await req.json()) as PatchBody;
    } catch {
      return err("invalid JSON body", 400);
    }

    const { data: current, error: curErr } = await admin()
      .from("dev_issues")
      .select("status")
      .eq("id", id)
      .single();
    if (curErr) return err(curErr.message, curErr.code === "PGRST116" ? 404 : 500);

    const patch: Record<string, unknown> = { updated_at: nowIso() };
    if (body.status !== undefined) patch.status = body.status;
    if (body.severity !== undefined) patch.severity = body.severity;
    if (body.area !== undefined) patch.area = body.area;
    if (body.assignee_id !== undefined) patch.assignee_id = body.assignee_id;
    if (body.task_id !== undefined) patch.task_id = body.task_id;
    if (body.description !== undefined) patch.description = body.description;

    const { data, error } = await admin()
      .from("dev_issues")
      .update(patch)
      .eq("id", id)
      .select(JOIN)
      .single();
    if (error) return err(error.message, 500);

    const statusChanged = body.status !== undefined && body.status !== current.status;
    await logActivity({
      actorId: body.actor_id ?? null,
      entityType: "dev_issue",
      entityId: id,
      action: statusChanged ? "status_changed" : "updated",
      summary: statusChanged
        ? `${current.status} → ${body.status}: ${data.title}`
        : (data.title as string),
    });

    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to update dev issue", 500);
  }
}
