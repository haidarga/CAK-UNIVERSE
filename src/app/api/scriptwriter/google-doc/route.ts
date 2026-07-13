import { admin, nowIso } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { replaceDocBody } from "@/lib/integrations/google/docs";
import type { Block } from "@/lib/scriptwriter/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseDocId(input: string): string | null {
  const m = input.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(input.trim()) ? input.trim() : null;
}

function renderNaskah(title: string | null, body: Block[]): string {
  let out = `${title || "Untitled naskah"} [[id]]\n`;
  for (const b of body) {
    const sp = b.speaker ? `${b.speaker}: ` : "";
    const ts = b.timestamp_range ? ` ${b.timestamp_range}` : "";
    out += `${b.shot_no}.${b.line_no} (${b.section_key}${ts}): ${sp}${b.text}\n`;
    if (b.visual_note) out += `   [${b.visual_note}]\n`;
  }
  return out + "\n";
}

// POST { batch_id, action: 'link'|'push', google_doc? }
//   link → point the batch at an existing Google Doc (Push overwrites it).
//   push → render all naskah in the batch into that Doc (full rewrite).
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err("invalid json"); }
  const batchId = String(body.batch_id || "");
  if (!batchId) return err("batch_id required");
  const action = body.action === "push" ? "push" : "link";

  const db = admin();
  const { data: batch } = await db.from("sw_batches").select("*").eq("id", batchId).single();
  if (!batch) return err("batch not found", 404);

  if (action === "link") {
    const docId = parseDocId(String(body.google_doc || ""));
    if (!docId) return err("could not read a Google Doc id from that input");
    const docUrl = `https://docs.google.com/document/d/${docId}/edit`;
    const { error } = await db.from("sw_batches").update({ external_doc_ref: { doc_id: docId, doc_url: docUrl, linked_at: nowIso() }, updated_at: nowIso() }).eq("id", batchId);
    if (error) return err(error.message, 500);
    return ok({ doc_id: docId, doc_url: docUrl });
  }

  // push
  const docId = (batch.external_doc_ref as { doc_id?: string } | null)?.doc_id;
  if (!docId) return err("no linked Google Doc — link one first", 400);

  const { data: naskahRows } = await db.from("sw_naskah").select("id, title, current_version_id").eq("batch_id", batchId).order("created_at", { ascending: true });
  const versionIds = (naskahRows ?? []).map((n) => n.current_version_id).filter(Boolean) as string[];
  const { data: versions } = versionIds.length ? await db.from("sw_naskah_versions").select("id, body").in("id", versionIds) : { data: [] };
  const bodyByVersion = new Map((versions ?? []).map((v: { id: string; body: Block[] }) => [v.id, v.body]));

  let full = "";
  for (const n of naskahRows ?? []) {
    if (!n.current_version_id) continue;
    full += renderNaskah(n.title, bodyByVersion.get(n.current_version_id) ?? []);
  }
  if (!full) full = "(no naskah in this batch yet)\n";

  try {
    await replaceDocBody(docId, full);
  } catch (e) {
    return err(e instanceof Error ? e.message : "push failed", 502);
  }
  await db.from("sw_batches").update({ external_doc_ref: { ...(batch.external_doc_ref as object), doc_id: docId, last_pushed_at: nowIso() }, updated_at: nowIso() }).eq("id", batchId);
  return ok({ doc_id: docId, naskah_count: (naskahRows ?? []).length });
}
