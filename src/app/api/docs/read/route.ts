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
/** A1 notation: optional `SheetName!` prefix + a cell or cell range. */
const A1_RANGE = /^(?:[\w \-']{1,40}!)?[A-Z]{1,3}\d{1,7}(?::[A-Z]{1,3}\d{1,7})?$/i;

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
      if (!A1_RANGE.test(range)) {
        return err("Format range gak valid (contoh: A1:Z200 atau Sheet1!A1:B2)", 400);
      }
      const values = await readRange(parsed.id, range);
      return ok({ kind: "sheet", id: parsed.id, range, values });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "read failed";
      const notConnected = /not connected|access token/i.test(msg);
      // Don't leak raw Google API errors (ids, scopes, quotas) to the client.
      if (!notConnected) console.error("[docs.read]", msg);
      return err(
        notConnected
          ? "Google belum connect — sambungin dulu di Integrations"
          : "Gagal baca dokumen — cek akses dokumen & format link",
        notConnected ? 401 : 502,
      );
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : "docs read failed", 500);
  }
}
