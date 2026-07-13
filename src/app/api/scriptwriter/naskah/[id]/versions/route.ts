import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { runAndInsertQc } from "@/lib/scriptwriter/generate";
import type { Block, VoicePersona } from "@/lib/scriptwriter/types";
import type { Brand } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH { body: Block[], change_summary? } → writer edit → new version (block_ids
// preserved) + fresh rule-based QC. The full critic is available via /qc/rerun.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return err("invalid json"); }
  const body = Array.isArray(json.body) ? (json.body as Block[]) : null;
  if (!body || body.length === 0) return err("body (Block[]) required");
  if (body.some((b) => !b.block_id || typeof b.text !== "string")) return err("each block needs block_id + text");

  const db = admin();
  const { data: naskah } = await db.from("sw_naskah").select("id, brand_id, persona_id, current_version_id").eq("id", id).single();
  if (!naskah) return err("not found", 404);

  const { data: current } = naskah.current_version_id
    ? await db.from("sw_naskah_versions").select("hook_type, hook_justification, format_meta, generation_meta").eq("id", naskah.current_version_id).single()
    : { data: null };

  const { data: version, error: vErr } = await db.rpc("sw_create_naskah_version", {
    p_naskah_id: id,
    p_body: body,
    p_hook_type: current?.hook_type ?? null,
    p_hook_justification: current?.hook_justification ?? null,
    p_format_meta: current?.format_meta ?? {},
    p_generation_meta: current?.generation_meta ?? null,
    p_created_via: "writer_edit",
    p_change_summary: typeof json.change_summary === "string" ? json.change_summary.slice(0, 500) : "writer edit",
  });
  if (vErr || !version) return err(vErr?.message || "failed to create version", 500);

  const [{ data: persona }, { data: brand }] = await Promise.all([
    naskah.persona_id ? db.from("personas").select("*").eq("id", naskah.persona_id).single() : Promise.resolve({ data: null }),
    db.from("brands").select("*").eq("id", naskah.brand_id).single(),
  ]);
  if (persona && brand) {
    await runAndInsertQc({ naskahId: id, versionId: version.id, blocks: body, persona: persona as VoicePersona, brand: brand as Brand, skipCritic: true });
  }
  return ok({ version });
}
