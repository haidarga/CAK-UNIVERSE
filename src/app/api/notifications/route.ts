// ============================================================
// /api/notifications
//   GET   — ?recipient= : that member's inbox, unread first then newest.
//   PATCH — ?id= : mark a single notification read.
//   POST  — body { recipientId } : mark ALL of a member's as read.
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const recipient = url.searchParams.get("recipient");
    if (!recipient) return err("recipient is required", 400);

    const { data, error } = await admin()
      .from("notifications")
      .select("*")
      .eq("recipient_id", recipient)
      .order("read", { ascending: true }) // unread (false) first
      .order("created_at", { ascending: false });
    if (error) return err(error.message, 500);
    return ok(data ?? []);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to load notifications", 500);
  }
}

export async function PATCH(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return err("id is required", 400);

    const { data, error } = await admin()
      .from("notifications")
      .update({ read: true })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return err(error.message, 500);
    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to mark notification read", 500);
  }
}

interface MarkAllBody {
  recipientId?: string;
}

export async function POST(req: Request) {
  try {
    let body: MarkAllBody;
    try {
      body = (await req.json()) as MarkAllBody;
    } catch {
      return err("invalid JSON body", 400);
    }
    if (!body.recipientId) return err("recipientId is required", 400);

    const { data, error } = await admin()
      .from("notifications")
      .update({ read: true })
      .eq("recipient_id", body.recipientId)
      .eq("read", false)
      .select("id");
    if (error) return err(error.message, 500);

    return ok({ marked: (data ?? []).length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to mark all read", 500);
  }
}
