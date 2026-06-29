// ============================================================
// GET /api/copilot/threads/[id]/messages
// Returns a thread's messages in chronological (oldest-first) order.
// ============================================================
import { ok, err } from "@/lib/api";
import { admin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return err("thread id is required", 400);

    const { data, error } = await admin()
      .from("copilot_messages")
      .select("id, thread_id, member_id, role, content, created_at")
      .eq("thread_id", id)
      .order("created_at", { ascending: true });
    if (error) return err(error.message, 500);

    return ok({ messages: data ?? [] });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to load messages", 500);
  }
}
