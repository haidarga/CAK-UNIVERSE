// ============================================================
// POST /api/brands/extract — turn a brand brief into a structured profile.
//
// body { url?: string; text?: string }
//   - url : a Google Doc link (body is read via the connected Google account)
//   - text: pasted brief / notes (used directly)
// Returns { profile } shaped like a Brand (partial) for the form to prefill.
// The user reviews + edits before saving — extraction never auto-creates.
// ============================================================
import { ok, err } from "@/lib/api";
import { aiAssist } from "@/lib/ai-assist";
import { parseGoogleUrl } from "@/lib/integrations/google/sync";
import { readDoc } from "@/lib/integrations/google/docs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SOURCE = 12000;

interface Body {
  url?: string;
  text?: string;
}

export async function POST(req: Request) {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return err("invalid JSON body", 400);
    }

    let source = (body.text ?? "").trim();

    // If a Google Doc URL is given, read its body (Sheets not supported here).
    const url = (body.url ?? "").trim();
    if (!source && url) {
      const parsed = parseGoogleUrl(url);
      if (!parsed || parsed.kind !== "doc") {
        return err("Cuma support link Google Docs (atau paste teks brief-nya)", 400);
      }
      try {
        source = (await readDoc(parsed.id)).trim();
      } catch (e) {
        return err(
          `Gagal baca Google Doc — pastiin Google udah connect & doc bisa diakses (${
            e instanceof Error ? e.message : "error"
          })`,
          502,
        );
      }
    }

    if (!source) return err("Kasih teks brief atau link Google Doc", 400);

    const result = await aiAssist({
      tool: "brand_extract",
      input: source.slice(0, MAX_SOURCE),
    });

    if (!result.data) return err("AI gagal nyusun profil brand dari brief", 502);
    return ok({ profile: result.data });
  } catch (e) {
    return err(e instanceof Error ? e.message : "brand extract failed", 500);
  }
}
