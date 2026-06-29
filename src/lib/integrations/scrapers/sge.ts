// ============================================================
// Social Growth Engineers (socialgrowthengineers.com) scraper.
// SGE is a PUBLIC editorial site of viral social-growth insights
// (categories: strategy, format, trend, opinion, newcomer, case-studies).
// No login needed — articles are listed on the landing + category pages.
// We scrape article links, derive a clean title from the slug, and filter
// by the strategist's topic. Never throws.
// ============================================================
import { withLightpanda } from "../browser";
import type { ResearchItem } from "../../research/index";

const BASE = "https://www.socialgrowthengineers.com";

// Paths that are navigation/section pages, not articles.
const NON_ARTICLE = new Set([
  "apps",
  "mysge",
  "case-studies",
  "about",
  "contact",
  "login",
  "search",
  "subscribe",
  "pricing",
]);

/** "the-wait-a-second-trend" -> "The Wait A Second Trend" (drops trailing number). */
function slugToTitle(slug: string): string {
  const parts = slug.split("-").filter(Boolean);
  if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) parts.pop();
  return parts.map((w) => (w.length <= 2 ? w : w[0].toUpperCase() + w.slice(1))).join(" ");
}

interface RawLink {
  url: string;
  slug: string;
}

export async function searchSGE(topic: string, limit = 12): Promise<ResearchItem[]> {
  const keywords = (topic || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  try {
    return await withLightpanda(async (page) => {
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await new Promise((r) => setTimeout(r, 2500));

      const raw: RawLink[] = await page.evaluate((base) => {
        const out: { url: string; slug: string }[] = [];
        const seen = new Set<string>();
        for (const a of Array.from(document.querySelectorAll("a"))) {
          const href = (a as HTMLAnchorElement).href;
          if (!href.startsWith(base)) continue;
          const path = href.slice(base.length).replace(/^\//, "").replace(/[?#].*$/, "");
          if (!/^[a-z0-9][a-z0-9-]{6,}$/.test(path)) continue; // single slug
          if (path.includes("/")) continue;
          if (seen.has(path)) continue;
          seen.add(path);
          out.push({ url: href, slug: path });
        }
        return out;
      }, BASE);

      const items: ResearchItem[] = raw
        .filter((r) => !NON_ARTICLE.has(r.slug))
        .map((r) => ({
          platform: "sge" as const,
          url: r.url,
          title: slugToTitle(r.slug),
          score: 0,
        }));

      // Topic-first ordering: matches first, then the rest (latest insights).
      const matched = items.filter((it) =>
        keywords.some(
          (k) => (it.title ?? "").toLowerCase().includes(k) || it.url.toLowerCase().includes(k),
        ),
      );
      const rest = items.filter((it) => !matched.includes(it));
      const ordered = keywords.length > 0 ? [...matched, ...rest] : items;

      return ordered.slice(0, limit);
    });
  } catch {
    return [];
  }
}
