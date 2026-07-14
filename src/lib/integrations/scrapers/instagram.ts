// ============================================================
// Instagram scrapers (Lightpanda / CDP).
//
// These drive a headless browser over CDP to read Instagram Reels/Explore
// surfaces for trending / high-engagement content. IG markup changes often
// and is aggressively obfuscated, so selectors are kept resilient: we collect
// reel/post anchors, prefer visible metric text, fall back to regex over body
// text, and ALWAYS return [] on failure. Connectors must never see an
// exception escape from here.
//
// ------------------------------------------------------------
// TODO(login): Instagram's /explore and /explore/tags pages require an
// AUTHENTICATED session — the public, logged-out view is sparse, paginates
// poorly, and triggers a login wall almost immediately. The assumption here
// is that the Lightpanda session this code connects to is ALREADY logged in
// with an existing account (cookies persisted on the Lightpanda side, or a
// prior automated login on the same browser profile).
//
// If/when this code must establish the session itself, plug it in at the
// SESSION ANCHOR marked below inside each scraper's withLightpanda callback:
//   - read IG_SESSION_COOKIE / IG_SESSIONID from env (NEVER hardcode creds)
//   - page.setCookie({ name: "sessionid", value: <fromEnv>, domain: ".instagram.com" })
//     BEFORE page.goto(), or perform a scripted login on /accounts/login/.
// Keep all credential material in env vars; this module reads none today.
// ------------------------------------------------------------
import type { Page } from "puppeteer-core";
import { withLightpanda } from "../browser";
import { parseCount } from "./util";

/**
 * Free auth: inject the user's own Instagram session cookie (grabbed from a
 * logged-in browser) so /explore/tags renders real content instead of a login
 * wall. Reads env only — never hardcode credentials:
 *   - IG_SESSIONID       → just the `sessionid` cookie value (simplest)
 *   - IG_SESSION_COOKIE  → a full "name=value; name2=value2" cookie string
 *                          (paste the whole Cookie header for best results)
 * No env set → no-op (public view, usually empty). Never throws.
 */
async function applyIgSession(page: Page): Promise<void> {
  try {
    const raw = process.env.IG_SESSION_COOKIE?.trim();
    const sid = process.env.IG_SESSIONID?.trim();
    const cookies: { name: string; value: string; domain: string; path: string }[] = [];
    if (raw) {
      for (const part of raw.split(";")) {
        const eq = part.indexOf("=");
        if (eq === -1) continue;
        const name = part.slice(0, eq).trim();
        const value = part.slice(eq + 1).trim();
        if (name && value) cookies.push({ name, value, domain: ".instagram.com", path: "/" });
      }
    } else if (sid) {
      cookies.push({ name: "sessionid", value: sid, domain: ".instagram.com", path: "/" });
    }
    if (cookies.length) await page.setCookie(...cookies);
  } catch {
    // cookie injection is best-effort — never block the scrape
  }
}

export function instagramSessionConfigured(): boolean {
  return !!(process.env.IG_SESSIONID?.trim() || process.env.IG_SESSION_COOKIE?.trim());
}

export interface InstagramItem {
  url: string;
  views?: number;
  likes?: number;
  thumbnail?: string;
  caption?: string;
}

/** Lightpanda tolerates a lighter event model than full Chrome. */
const WAIT_UNTIL = "domcontentloaded" as const;
const DEFAULT_LIMIT = 18;

/** Reel/post permalink shapes IG uses: /reel/<id>/, /p/<id>/, /tv/<id>/. */
const PERMALINK_RE = /\/(reel|reels|p|tv)\/[\w-]+/;

/**
 * Scrape the Explore / Reels surface for trending reels + posts.
 * Returns [] on any failure (login wall, layout change, blocked page).
 */
export async function scrapeInstagramReelsExplore(limit = DEFAULT_LIMIT): Promise<InstagramItem[]> {
  // /explore/ surfaces algorithmic trending content for the logged-in account;
  // /reels/ is the video-only feed. Explore tends to be richer, so prefer it.
  const url = "https://www.instagram.com/explore/";
  try {
    return await withLightpanda(async (page) => {
      await applyIgSession(page); // free auth via user's own session cookie (env)
      await page.goto(url, { waitUntil: WAIT_UNTIL });
      const items = await collectItems(page, limit);
      return mapItems(items);
    });
  } catch {
    return [];
  }
}

/**
 * Scrape a hashtag's top/recent grid for high-engagement reels + posts.
 * Returns [] on any failure. `limit` caps the number of items returned.
 */
export async function scrapeInstagramHashtag(tag: string, limit = DEFAULT_LIMIT): Promise<InstagramItem[]> {
  const cleanTag = tag.replace(/^#/, "").trim();
  if (!cleanTag) return [];
  const url = `https://www.instagram.com/explore/tags/${encodeURIComponent(cleanTag)}/`;
  try {
    return await withLightpanda(async (page) => {
      await applyIgSession(page); // free auth via user's own session cookie (env)
      await page.goto(url, { waitUntil: WAIT_UNTIL });
      const items = await collectItems(page, limit);
      return mapItems(items);
    });
  } catch {
    return [];
  }
}

interface RawItem {
  url: string;
  views: string | null;
  likes: string | null;
  thumbnail: string | null;
  caption: string | null;
}

/**
 * In-page collection: gather reel/post anchors and best-effort metrics.
 * Runs inside the browser context, so it must be self-contained (no closures
 * over Node values except the serializable args passed to evaluate).
 */
async function collectItems(page: Page, limit: number): Promise<RawItem[]> {
  return page.evaluate(
    (max: number, permalinkSource: string) => {
      const permalink = new RegExp(permalinkSource);
      const out: RawItem[] = [];
      const seen = new Set<string>();

      const findMetric = (scope: Element, labels: string[]): string | null => {
        // IG hides metrics behind aria-labels and span text; scan both.
        const aria = scope.querySelector<HTMLElement>("[aria-label]");
        const ariaText = aria?.getAttribute("aria-label") ?? "";
        for (const label of labels) {
          const re = new RegExp(`([\\d.,]+\\s*[KMB]?)\\s*${label}`, "i");
          const m = (ariaText || "").match(re) ?? (scope.textContent ?? "").match(re);
          if (m) return m[1].trim();
        }
        return null;
      };

      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
      for (const a of anchors) {
        const href = a.href;
        if (!permalink.test(href) || seen.has(href)) continue;
        seen.add(href);

        const container = a.closest("article") ?? a.parentElement ?? a;
        const img = a.querySelector("img");

        out.push({
          url: href,
          views: findMetric(container, ["views", "plays", "views"]),
          likes: findMetric(container, ["likes"]),
          thumbnail: img?.getAttribute("src") ?? null,
          caption: img?.getAttribute("alt") ?? null,
        });
        if (out.length >= max) break;
      }
      return out;
    },
    limit,
    PERMALINK_RE.source,
  );
}

/** Convert raw string metrics into the public InstagramItem shape. */
function mapItems(raw: RawItem[]): InstagramItem[] {
  return raw.map((it) => {
    const mapped: InstagramItem = { url: it.url };
    if (it.views) mapped.views = parseCount(it.views);
    if (it.likes) mapped.likes = parseCount(it.likes);
    if (it.thumbnail) mapped.thumbnail = it.thumbnail;
    if (it.caption) mapped.caption = it.caption.trim();
    return mapped;
  });
}
