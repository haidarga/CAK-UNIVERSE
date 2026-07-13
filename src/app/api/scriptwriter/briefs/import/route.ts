import { err, ok } from "@/lib/api";
import { readRange } from "@/lib/integrations/google/sheets";
import { readDoc } from "@/lib/integrations/google/docs";
import { extractBriefs } from "@/lib/scriptwriter/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseSheetId(input: string): string | null {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(input.trim()) ? input.trim() : null;
}
function parseDocId(input: string): string | null {
  const m = input.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(input.trim()) ? input.trim() : null;
}

// POST — extract briefs from a content plan. Source is ONE of:
//   { text }                → pasted plan
//   { google_sheet, range? } → a Google Sheet (reuses the ecosystem Google layer)
//   { google_doc }          → a Google Doc
// Returns a PREVIEW only (nothing is written). Brand-scoped commit happens later.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err("invalid json"); }

  let text = "";
  try {
    if (typeof body.text === "string" && body.text.trim()) {
      text = body.text;
    } else if (typeof body.google_sheet === "string" && body.google_sheet.trim()) {
      const id = parseSheetId(body.google_sheet);
      if (!id) return err("could not read a Google Sheet id from that input");
      const rows = await readRange(id, typeof body.range === "string" && body.range ? body.range : "A1:Z2000");
      text = rows.map((r) => r.join(" | ")).join("\n");
    } else if (typeof body.google_doc === "string" && body.google_doc.trim()) {
      const id = parseDocId(body.google_doc);
      if (!id) return err("could not read a Google Doc id from that input");
      text = await readDoc(id);
    } else {
      return err("provide text, google_sheet, or google_doc");
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : "failed to read source", 502);
  }

  const result = await extractBriefs(text);
  if (!result.ok) return err(result.error, 422);
  return ok({ briefs: result.briefs, count: result.briefs.length });
}
