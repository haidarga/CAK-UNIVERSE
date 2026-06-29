// ============================================================
// /api/tasks
//   GET  — list tasks with filters (?assignee= &brandId= &status= &type=)
//          joins assignee (team_members) + brands; ordered priority asc, due_date.
//   POST — create a task, log activity, notify the assignee.
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { logActivity, notify } from "@/lib/activity";
import type { TaskStatus, TaskType } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const assignee = url.searchParams.get("assignee");
    const brandId = url.searchParams.get("brandId");
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");

    let query = admin()
      .from("tasks")
      .select("*, assignee:team_members(*), brands(*)")
      .order("priority", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false });

    if (assignee) query = query.eq("assignee_id", assignee);
    if (brandId) query = query.eq("brand_id", brandId);
    if (status) query = query.eq("status", status);
    if (type) query = query.eq("type", type);

    const { data, error } = await query;
    if (error) return err(error.message, 500);
    return ok(data ?? []);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list tasks", 500);
  }
}

interface CreateBody {
  title?: string;
  type?: TaskType;
  brand_id?: string | null;
  pipeline_id?: string | null;
  description?: string | null;
  priority?: number;
  assignee_id?: string | null;
  created_by?: string | null;
  due_date?: string | null;
  status?: TaskStatus;
  labels?: string[];
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

    const insert = {
      title: body.title.trim(),
      type: body.type ?? "general",
      brand_id: body.brand_id ?? null,
      pipeline_id: body.pipeline_id ?? null,
      description: body.description ?? null,
      priority: body.priority ?? 3,
      status: body.status ?? "backlog",
      assignee_id: body.assignee_id ?? null,
      created_by: body.created_by ?? null,
      due_date: body.due_date ?? null,
      labels: Array.isArray(body.labels) ? body.labels : [],
    };

    const { data, error } = await admin().from("tasks").insert(insert).select("*").single();
    if (error) return err(error.message, 500);

    await logActivity({
      actorId: body.created_by ?? null,
      entityType: "task",
      entityId: data.id as string,
      action: "created",
      summary: data.title as string,
      brandId: (data.brand_id as string | null) ?? null,
    });

    if (data.assignee_id) {
      await notify({
        recipientId: data.assignee_id as string,
        type: "assignment",
        title: "New task assigned",
        body: data.title as string,
        link: `/tasks/${data.id}`,
      });
    }

    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to create task", 500);
  }
}
