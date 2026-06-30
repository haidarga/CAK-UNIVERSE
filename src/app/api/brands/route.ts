// ============================================================
// /api/brands
//   GET  — list all brands ordered by name.
//   POST — create a brand from a (sanitized) profile payload.
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { sanitizeBrandInput, slugify } from "@/lib/brand-input";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { data, error } = await admin().from("brands").select("*").order("name", { ascending: true });
    if (error) return err(error.message, 500);
    return ok(data ?? []);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list brands", 500);
  }
}

export async function POST(req: Request) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return err("invalid JSON body", 400);
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return err("name is required", 400);

    const fields = sanitizeBrandInput(body);
    const slug =
      typeof body.slug === "string" && body.slug.trim() ? slugify(body.slug) : slugify(name);

    const { data, error } = await admin()
      .from("brands")
      .insert({ ...fields, slug })
      .select("*")
      .single();
    if (error) {
      const dup = (error as { code?: string }).code === "23505"; // unique_violation
      return err(
        dup ? `Slug "${slug}" sudah dipakai — ganti nama brand` : error.message,
        dup ? 409 : 500,
      );
    }

    await logActivity({
      entityType: "brand",
      entityId: data.id as string,
      action: "created",
      summary: data.name as string,
    });

    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to create brand", 500);
  }
}
