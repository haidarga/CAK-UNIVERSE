import { admin, nowIso } from "@/lib/supabase";
import { ok, err } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → naskah + current version (body, hook) + open flags.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = admin();
  const { data: naskah, error } = await db.from("sw_naskah").select("*").eq("id", id).single();
  if (error || !naskah) return err("not found", 404);

  const [{ data: version }, { data: flags }] = await Promise.all([
    naskah.current_version_id ? db.from("sw_naskah_versions").select("*").eq("id", naskah.current_version_id).single() : Promise.resolve({ data: null }),
    naskah.current_version_id ? db.from("sw_qc_flags").select("*").eq("naskah_version_id", naskah.current_version_id).order("created_at", { ascending: true }) : Promise.resolve({ data: [] }),
  ]);
  return ok({ naskah, version, flags: flags ?? [] });
}

// PATCH { status: 'approved'|'rejected' } → triage decision.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err("invalid json"); }
  const status = body.status;
  if (status !== "approved" && status !== "rejected" && status !== "draft") return err("status must be approved|rejected|draft");

  const { data, error } = await admin().from("sw_naskah").update({ status, updated_at: nowIso() }).eq("id", id).select("id, status").single();
  if (error || !data) return err("not found", 404);
  return ok({ naskah: data });
}
