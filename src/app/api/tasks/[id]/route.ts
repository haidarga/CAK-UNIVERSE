// ============================================================
// /api/tasks/[id]
//   GET   — single task with assignee + brands + its comments.
//   PATCH — update status/progress/assignee_id/priority/due_date/
//           description/title. Auto-sets completed_at/started_at on
//           status transitions; logs the change to the activity feed.
// ============================================================
import { admin, nowIso } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { logActivity, notify } from "@/lib/activity";
import type { TaskStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const { data: task, error } = await admin()
      .from("tasks")
      .select("*, assignee:team_members(*), brands(*)")
      .eq("id", id)
      .single();
    if (error) return err(error.message, error.code === "PGRST116" ? 404 : 500);

    const { data: comments, error: cErr } = await admin()
      .from("task_comments")
      .select("*, author:team_members(*)")
      .eq("task_id", id)
      .order("created_at", { ascending: true });
    if (cErr) return err(cErr.message, 500);

    return ok({ ...task, comments: comments ?? [] });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to load task", 500);
  }
}

interface PatchBody {
  status?: TaskStatus;
  progress?: number;
  assignee_id?: string | null;
  priority?: number;
  due_date?: string | null;
  description?: string | null;
  title?: string;
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

    // Load current state so we can detect status transitions.
    const { data: current, error: curErr } = await admin()
      .from("tasks")
      .select("status, started_at, assignee_id")
      .eq("id", id)
      .single();
    if (curErr) return err(curErr.message, curErr.code === "PGRST116" ? 404 : 500);

    const patch: Record<string, unknown> = { updated_at: nowIso() };

    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.priority !== undefined) patch.priority = body.priority;
    if (body.due_date !== undefined) patch.due_date = body.due_date;
    if (body.progress !== undefined) patch.progress = body.progress;
    if (body.assignee_id !== undefined) patch.assignee_id = body.assignee_id;

    const statusChanged = body.status !== undefined && body.status !== current.status;
    if (body.status !== undefined) {
      patch.status = body.status;
      if (body.status === "done") {
        patch.completed_at = nowIso();
        patch.progress = 100;
      }
      if (body.status === "in_progress" && !current.started_at) {
        patch.started_at = nowIso();
      }
    }

    const { data, error } = await admin()
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .select("*, assignee:team_members(*), brands(*)")
      .single();
    if (error) return err(error.message, 500);

    await logActivity({
      actorId: body.actor_id ?? null,
      entityType: "task",
      entityId: id,
      action: statusChanged ? "status_changed" : "updated",
      summary: statusChanged
        ? `${current.status} → ${body.status}: ${data.title}`
        : (data.title as string),
      brandId: (data.brand_id as string | null) ?? null,
    });

    // Notify a newly-assigned member.
    if (
      body.assignee_id !== undefined &&
      body.assignee_id &&
      body.assignee_id !== current.assignee_id
    ) {
      await notify({
        recipientId: body.assignee_id,
        type: "assignment",
        title: "Task assigned to you",
        body: data.title as string,
        link: `/tasks/${id}`,
      });
    }

    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to update task", 500);
  }
}
