// ============================================================
// Social Growth Engineers (socialgrowthengineers.com) scraper.
//
// Two tiers, tried in order from ONE browser session:
//   1) PRO  — if the shared Chrome/CDP profile is logged in, the Pro View
//             (/mysge) exposes a clean JSON API `/api/mysge/articles` (auth via
//             the Supabase session cookie). Richest, curated feed.
//   2) PUBLIC — fallback: the landing page lists public articles as <a> slugs;
//             we derive a clean title from the slug.
//
// Login is a one-time, passwordless 6-digit OTP (see scripts/_sge_*.ts). Once
// done, the cookie persists in the F: Chrome profile, so Pro keeps working.
// Topic-filtered, ranked matched-first. Never throws.
// ============================================================
import { withLightpanda } from "../browser";
import type { ResearchItem } from "../../research/index";

const BASE = "https://www.socialgrowthengineers.com";

// Paths that are navigation/section pages, not articles (public fallback).
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

function topicWords(topic: string): string[] {
  return (topic || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

/** matched-first ordering, then the rest (latest); cap at limit. */
function orderByTopic(items: ResearchItem[], keywords: string[], limit: number): ResearchItem[] {
  if (keywords.length === 0) return items.slice(0, limit);
  const matched = items.filter((it) =>
    keywords.some(
      (k) => (it.title ?? "").toLowerCase().includes(k) || it.url.toLowerCase().includes(k),
    ),
  );
  const rest = items.filter((it) => !matched.includes(it));
  return [...matched, ...rest].slice(0, limit);
}

interface ProPost {
  title?: string;
  slug?: string;
}

/** Pro tier: fetch /api/mysge/articles from the (logged-in) page context. */
async function fetchProPosts(page: import("puppeteer-core").Page): Promise<ProPost[]> {
  await page.goto(`${BASE}/mysge`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await new Promise((r) => setTimeout(r, 1500));
  return page.evaluate(async (base) => {
    try {
      const r = await fetch(`${base}/api/mysge/articles`, { credentials: "include" });
      if (!r.ok) return [];
      const j = (await r.json()) as { posts?: { title?: string; slug?: string }[] };
      return Array.isArray(j.posts) ? j.posts : [];
    } catch {
      return [];
    }
  }, BASE);
}

/** Public tier: sweep article-slug anchors off the landing page. */
async function fetchPublicSlugs(page: import("puppeteer-core").Page): Promise<string[]> {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2000));
  return page.evaluate((base) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of Array.from(document.querySelectorAll("a"))) {
      const href = (a as HTMLAnchorElement).href;
      if (!href.startsWith(base)) continue;
      const path = href.slice(base.length).replace(/^\//, "").replace(/[?#].*$/, "");
      if (!/^[a-z0-9][a-z0-9-]{6,}$/.test(path) || path.includes("/")) continue;
      if (seen.has(path)) continue;
      seen.add(path);
      out.push(path);
    }
    return out;
  }, BASE);
}

export async function searchSGE(topic: string, limit = 12): Promise<ResearchItem[]> {
  const keywords = topicWords(topic);

  try {
    return await withLightpanda(async (page) => {
      const byUrl = new Map<string, ResearchItem>();

      // --- Tier 1: Pro API (curated, fresh — small set, ~5 latest) ---
      // Listed first so curated Briefing posts surface on ties / no topic match.
      const pro = await fetchProPosts(page);
      for (const p of pro) {
        if (!p.slug) continue;
        const url = `${BASE}/${p.slug}`;
        if (byUrl.has(url)) continue;
        byUrl.set(url, {
          platform: "sge",
          url,
          title: p.title?.trim() || slugToTitle(p.slug),
          score: 0,
        });
      }

      // --- Tier 2: public landing (broad, ~40 across categories — matchable) ---
      const slugs = await fetchPublicSlugs(page);
      for (const s of slugs) {
        if (NON_ARTICLE.has(s)) continue;
        const url = `${BASE}/${s}`;
        if (byUrl.has(url)) continue;
        byUrl.set(url, { platform: "sge", url, title: slugToTitle(s), score: 0 });
      }

      return orderByTopic(Array.from(byUrl.values()), keywords, limit);
    });
  } catch {
    return [];
  }
}
