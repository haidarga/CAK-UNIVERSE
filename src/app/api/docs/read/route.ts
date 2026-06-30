// ============================================================
// POST /api/docs/read — read a whole Google Doc body or a Sheet range.
//
// body { url: string; range?: string }
//   - Google Doc  -> { kind:"doc",   id, body }
//   - Google Sheet -> { kind:"sheet", id, range, values }
// Used by the Documents workspace to mirror the full document in-platform.
// ============================================================
import { ok, err } from "@/lib/api";
import { parseGoogleUrl } from "@/lib/integrations/google/sync";
import { readDoc } from "@/lib/integrations/google/docs";
import { readRange } from "@/lib/integrations/google/sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_RANGE = "A1:Z200";

interface Body {
  url?: string;
  range?: string;
}

export async function POST(req: Request) {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return err("invalid JSON body", 400);
    }

    const parsed = parseGoogleUrl((body.url ?? "").trim());
    if (!parsed) return err("Bukan link Google Docs/Sheets yang valid", 400);

    try {
      if (parsed.kind === "doc") {
        const text = await readDoc(parsed.id);
        return ok({ kind: "doc", id: parsed.id, body: text });
      }
      const range = (body.range ?? "").trim() || DEFAULT_RANGE;
      const values = await readRange(parsed.id, range);
      return ok({ kind: "sheet", id: parsed.id, range, values });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "read failed";
      const notConnected = /not connected|access token/i.test(msg);
      return err(
        notConnected
          ? "Google belum connect — sambungin dulu di Integrations"
          : `Gagal baca dokumen: ${msg}`,
        notConnected ? 401 : 502,
      );
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : "docs read failed", 500);
  }
}
