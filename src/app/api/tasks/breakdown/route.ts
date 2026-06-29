// ============================================================
// POST /api/tasks/breakdown
//   body { goal, brandId?, createdBy? }
//   Uses aiAssist(task_breakdown) to split a goal into subtasks,
//   inserts each as an ai_generated backlog task, returns them.
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { aiAssist } from "@/lib/ai-assist";
import { logActivity } from "@/lib/activity";
import { TASK_TYPES, type TaskType } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  goal?: string;
  brandId?: string | null;
  createdBy?: string | null;
}

interface SubtaskShape {
  title?: unknown;
  type?: unknown;
  priority?: unknown;
}

function coerceType(value: unknown): TaskType {
  return (TASK_TYPES as readonly string[]).includes(value as string)
    ? (value as TaskType)
    : "general";
}

function coercePriority(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && n <= 4 ? Math.round(n) : 3;
}

export async function POST(req: Request) {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return err("invalid JSON body", 400);
    }

    if (!body.goal || !body.goal.trim()) return err("goal is required", 400);

    const result = await aiAssist({ tool: "task_breakdown", input: body.goal });
    const items = Array.isArray(result.data) ? (result.data as SubtaskShape[]) : [];
    if (items.length === 0) return err("AI returned no subtasks", 502);

    const rows = items
      .filter((it) => typeof it.title === "string" && (it.title as string).trim())
      .map((it) => ({
        title: (it.title as string).trim(),
        type: coerceType(it.type),
        priority: coercePriority(it.priority),
        status: "backlog",
        brand_id: body.brandId ?? null,
        created_by: body.createdBy ?? null,
        ai_generated: true,
      }));

    if (rows.length === 0) return err("AI returned no usable subtasks", 502);

    const { data, error } = await admin().from("tasks").insert(rows).select("*");
    if (error) return err(error.message, 500);

    await logActivity({
      actorId: body.createdBy ?? null,
      entityType: "task",
      action: "created",
      summary: `AI broke down goal into ${rows.length} tasks: ${body.goal.trim().slice(0, 100)}`,
      brandId: body.brandId ?? null,
    });

    return ok(data ?? [], { count: (data ?? []).length, goal: body.goal.trim() });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to break down goal", 500);
  }
}
