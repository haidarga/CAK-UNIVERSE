// ============================================================
// /api/brands/[id]
//   PATCH  — update brand fields (partial; only provided keys change).
//   DELETE — remove a brand.
//
// AUTHZ: single-org internal tool — every authenticated member may edit/delete
// any brand. There is intentionally no per-resource ownership check. Revisit
// if this ever becomes multi-tenant.
// ============================================================
import { admin, nowIso } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { sanitizeBrandInput, slugify } from "@/lib/brand-input";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return err("invalid JSON body", 400);
    }

    const patch = sanitizeBrandInput(body, { partial: true });
    if (typeof body.slug === "string" && body.slug.trim()) patch.slug = slugify(body.slug);
    if (Object.keys(patch).length === 0) return err("no fields to update", 400);
    patch.updated_at = nowIso();

    const { data, error } = await admin()
      .from("brands")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "PGRST116") return err("brand not found", 404);
      const dup = (error as { code?: string }).code === "23505";
      if (!dup) console.error("[brands.PATCH]", error.message);
      return err(dup ? "Slug sudah dipakai brand lain" : "Gagal menyimpan brand", dup ? 409 : 500);
    }

    await logActivity({
      entityType: "brand",
      entityId: id,
      action: "updated",
      summary: data.name as string,
    });

    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to update brand", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // .select() so we can tell a real delete from a no-op (Supabase delete
    // succeeds with zero rows when the id doesn't exist).
    const { data, error } = await admin().from("brands").delete().eq("id", id).select("id");
    if (error) {
      console.error("[brands.DELETE]", error.message);
      return err("Gagal menghapus brand", 500);
    }
    if (!data || data.length === 0) return err("brand not found", 404);
    await logActivity({ entityType: "brand", entityId: id, action: "deleted" });
    return ok({ id });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to delete brand", 500);
  }
}
