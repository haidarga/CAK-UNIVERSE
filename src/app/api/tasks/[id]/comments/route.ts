// ============================================================
// /api/tasks/[id]/comments
//   GET  — list comments for a task (with author), oldest first.
//   POST — add a comment { author_id, body }, then log activity.
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { data, error } = await admin()
      .from("task_comments")
      .select("*, author:team_members(*)")
      .eq("task_id", id)
      .order("created_at", { ascending: true });
    if (error) return err(error.message, 500);
    return ok(data ?? []);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list comments", 500);
  }
}

interface CommentBody {
  author_id?: string | null;
  body?: string;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    let body: CommentBody;
    try {
      body = (await req.json()) as CommentBody;
    } catch {
      return err("invalid JSON body", 400);
    }

    if (!body.body || !body.body.trim()) return err("body is required", 400);

    const { data, error } = await admin()
      .from("task_comments")
      .insert({ task_id: id, author_id: body.author_id ?? null, body: body.body.trim() })
      .select("*, author:team_members(*)")
      .single();
    if (error) return err(error.message, 500);

    await logActivity({
      actorId: body.author_id ?? null,
      entityType: "task",
      entityId: id,
      action: "commented",
      summary: body.body.trim().slice(0, 140),
    });

    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to add comment", 500);
  }
}
