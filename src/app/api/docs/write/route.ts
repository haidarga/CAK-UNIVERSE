// ============================================================
// POST /api/docs/write — push the whole Doc body or a Sheet grid back.
//
// body { url: string; body?: string; values?: string[][]; range?: string }
//   - Google Doc  : replaces the entire body with `body`.
//   - Google Sheet: writes `values` to `range` (RAW), anchored at its top-left.
// ============================================================
import { ok, err } from "@/lib/api";
import { parseGoogleUrl } from "@/lib/integrations/google/sync";
import { replaceDocBody } from "@/lib/integrations/google/docs";
import { writeRange } from "@/lib/integrations/google/sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_RANGE = "A1";

interface Body {
  url?: string;
  body?: string;
  values?: string[][];
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
        await replaceDocBody(parsed.id, body.body ?? "");
      } else {
        const values = Array.isArray(body.values) ? body.values : [];
        const range = (body.range ?? "").trim() || DEFAULT_RANGE;
        await writeRange(parsed.id, range, values);
      }
      return ok({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "write failed";
      const notConnected = /not connected|access token/i.test(msg);
      return err(
        notConnected
          ? "Google belum connect — sambungin dulu di Integrations"
          : `Gagal nyimpan ke dokumen: ${msg}`,
        notConnected ? 401 : 502,
      );
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : "docs write failed", 500);
  }
}
