// ============================================================
// TikTok scrapers (Lightpanda / CDP).
//
// These drive a headless browser over CDP to read PUBLIC TikTok pages
// (profile + hashtag). TikTok markup changes often, so selectors are kept
// resilient: we prefer data-e2e attributes (TikTok's stable test hooks),
// fall back to regex over visible text, and ALWAYS return null/[] on failure.
// Connectors must never see an exception escape from here.
// ============================================================
import { withLightpanda } from "../browser";
import { parseCount } from "./util";

export { parseCount } from "./util";

export interface TikTokProfileStats {
  followers?: number;
  following?: number;
  totalPosts?: number;
  recentViews?: number[];
}

export interface TikTokHashtagItem {
  url: string;
  views?: number;
  thumbnail?: string;
}

/** Networkidle-ish wait that tolerates Lightpanda's lighter event model. */
const WAIT_UNTIL = "domcontentloaded" as const;

/**
 * Scrape a public TikTok profile header for follower/following/post counts.
 * Returns null on any failure (bad username, blocked page, layout change).
 */
export async function scrapeTikTokProfile(username: string): Promise<TikTokProfileStats | null> {
  const handle = username.replace(/^@/, "").trim();
  if (!handle) return null;
  const url = `https://www.tiktok.com/@${encodeURIComponent(handle)}`;

  try {
    return await withLightpanda(async (page) => {
      await page.goto(url, { waitUntil: WAIT_UNTIL });

      const raw = await page.evaluate(() => {
        const text = (sel: string): string | null => {
          const el = document.querySelector(sel);
          return el ? (el.textContent ?? "").trim() : null;
        };
        // data-e2e are TikTok's most stable hooks; bodyText is the fallback.
        return {
          following: text('[data-e2e="following-count"]'),
          followers: text('[data-e2e="followers-count"]'),
          likes: text('[data-e2e="likes-count"]'),
          bodyText: document.body?.innerText ?? "",
        };
      });

      const stats: TikTokProfileStats = {};

      const followers = raw.followers ?? matchLabeled(raw.bodyText, "followers");
      const following = raw.following ?? matchLabeled(raw.bodyText, "following");
      if (followers) stats.followers = parseCount(followers);
      if (following) stats.following = parseCount(following);

      // TikTok profile headers do not expose a clean post count via data-e2e;
      // leave totalPosts undefined unless a future selector is added.
      return Object.keys(stats).length > 0 ? stats : null;
    });
  } catch {
    return null;
  }
}

/**
 * Best-effort scrape of a hashtag page for video links + view counts.
 * Returns [] on any failure. `limit` caps the number of items returned.
 */
export async function scrapeTikTokHashtag(tag: string, limit = 15): Promise<TikTokHashtagItem[]> {
  const cleanTag = tag.replace(/^#/, "").trim();
  if (!cleanTag) return [];
  const url = `https://www.tiktok.com/tag/${encodeURIComponent(cleanTag)}`;

  try {
    return await withLightpanda(async (page) => {
      await page.goto(url, { waitUntil: WAIT_UNTIL });

      const items = await page.evaluate((max: number) => {
        const out: Array<{ url: string; views: string | null; thumbnail: string | null }> = [];
        const seen = new Set<string>();
        const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
        for (const a of anchors) {
          const href = a.href;
          if (!/\/video\/\d+/.test(href) || seen.has(href)) continue;
          seen.add(href);
          const container = a.closest('[data-e2e="challenge-item"]') ?? a;
          const viewsEl = container.querySelector('[data-e2e="video-views"]');
          const img = a.querySelector("img");
          out.push({
            url: href,
            views: viewsEl ? (viewsEl.textContent ?? "").trim() : null,
            thumbnail: img?.getAttribute("src") ?? null,
          });
          if (out.length >= max) break;
        }
        return out;
      }, limit);

      return items.map((it) => {
        const mapped: TikTokHashtagItem = { url: it.url };
        if (it.views) mapped.views = parseCount(it.views);
        if (it.thumbnail) mapped.thumbnail = it.thumbnail;
        return mapped;
      });
    });
  } catch {
    return [];
  }
}

/**
 * Fallback: pull a count that appears right before a label in free text,
 * e.g. "1.2M Followers". Returns null if not found.
 */
function matchLabeled(body: string, label: string): string | null {
  if (!body) return null;
  const re = new RegExp(`([\\d.,]+\\s*[KMB]?)\\s*${label}`, "i");
  const m = body.match(re);
  return m ? m[1].trim() : null;
}
