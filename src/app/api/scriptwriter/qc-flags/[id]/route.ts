import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH { status: 'resolved'|'dismissed'|'open' } — writer disposition of a flag.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err("invalid json"); }
  const status = body.status;
  if (status !== "resolved" && status !== "dismissed" && status !== "open") return err("status must be resolved|dismissed|open");

  const { data, error } = await admin().from("sw_qc_flags").update({ status }).eq("id", id).select("id, status").single();
  if (error || !data) return err("not found", 404);
  return ok({ flag: data });
}
