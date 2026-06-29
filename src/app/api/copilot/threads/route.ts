// ============================================================
// /api/copilot/threads
// GET    ?memberId=  → list that member's chat threads (newest first, max 50)
// DELETE ?id=        → delete a thread (messages cascade via FK)
// ============================================================
import { ok, err } from "@/lib/api";
import { admin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const THREAD_LIMIT = 50;

export async function GET(req: Request) {
  try {
    const memberId = new URL(req.url).searchParams.get("memberId")?.trim();
    if (!memberId) return err("memberId is required", 400);

    const { data, error } = await admin()
      .from("copilot_threads")
      .select("id, member_id, title, route, created_at, updated_at, last_message_at")
      .eq("member_id", memberId)
      .order("last_message_at", { ascending: false })
      .limit(THREAD_LIMIT);
    if (error) return err(error.message, 500);

    return ok({ threads: data ?? [] });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list threads", 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id")?.trim();
    if (!id) return err("id is required", 400);

    const { error } = await admin().from("copilot_threads").delete().eq("id", id);
    if (error) return err(error.message, 500);

    return ok({ deleted: id });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to delete thread", 500);
  }
}
