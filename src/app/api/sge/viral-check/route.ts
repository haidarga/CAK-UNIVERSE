// ============================================================
// POST /api/sge/viral-check — "bisa viral gak + how-to" for a content idea.
//
// body { title: string; hook?; format?; theme?; notes? }
//
// Pulls SGE insights (titles + excerpts) as a viral-mechanics knowledge base,
// then asks the viral_check assistant to score the idea and explain how to make
// it go viral, grounded in those insights. Never depends on SGE being up — if
// the knowledge base is empty, the verdict is still returned (just ungrounded).
// ============================================================
import { ok, err } from "@/lib/api";
import { aiAssist } from "@/lib/ai-assist";
import { fetchSGEArticles } from "@/lib/integrations/scrapers/sge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_LEN = 600;

interface Body {
  title?: string;
  hook?: string;
  format?: string;
  theme?: string;
  notes?: string;
}

function clamp(s: unknown): string {
  return typeof s === "string" ? s.trim().slice(0, MAX_LEN) : "";
}

export async function POST(req: Request) {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return err("invalid JSON body", 400);
    }

    const title = clamp(body.title);
    if (!title) return err("title/idea is required", 400);

    const articles = await fetchSGEArticles(16);
    const knowledge = articles.length
      ? articles
          .map((a, i) => `${i + 1}. ${a.title}${a.excerpt ? ` — ${a.excerpt}` : ""}`)
          .join("\n")
      : "(SGE knowledge unavailable — Chrome CDP may be down; judge from general principles)";

    const idea = [
      `Judul/ide: ${title}`,
      body.hook && `Hook: ${clamp(body.hook)}`,
      body.format && `Format: ${clamp(body.format)}`,
      body.theme && `Tema naratif: ${clamp(body.theme)}`,
      body.notes && `Catatan riset: ${clamp(body.notes)}`,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await aiAssist({
      tool: "viral_check",
      input: idea,
      context: `INSIGHT VIRAL DARI SOCIAL GROWTH ENGINEERS (acuan, jangan dikarang):\n${knowledge}`,
    });

    return ok({ verdict: result.data ?? result.text, sourcesUsed: articles.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "viral check failed", 500);
  }
}
