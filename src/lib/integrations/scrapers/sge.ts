// ============================================================
// Social Growth Engineers (socialgrowthengineers.com) topic search.
//
// SGE is a paid library of viral-post breakdowns behind a login. This scraper:
//   1) connects to the shared CDP browser via withLightpanda
//   2) best-effort logs in with SGE_EMAIL / SGE_PASSWORD (wrapped in try/catch)
//   3) navigates to a search/explore surface for the topic
//   4) scrapes article/card anchors that look like viral-post entries,
//      filtered by the topic keyword
//
// The live site's exact DOM is UNKNOWN to this code. The in-page collection is
// deliberately RESILIENT (generic anchor sweep + keyword filter) rather than
// pinned to brittle selectors.
//
// TODO(selectors): tune the login form selectors and the post-card selectors
// against the real socialgrowthengineers.com markup. The current login fill is
// a best-effort guess (email/password inputs + submit) and the post sweep
// matches any anchor whose href/text looks like a content entry. Inspect the
// live DOM and replace the heuristic selectors below with stable ones.
//
// CONTRACT: returns [] on ANY failure (missing creds, login wall, layout
// change, timeout). Never throws — connectors/orchestrator must not see an
// exception escape from here.
// ============================================================
import type { Page } from "puppeteer-core";
import { withLightpanda } from "../browser";
import { parseCount } from "./util";
import type { ResearchItem } from "../../research";

const BASE_URL = "https://www.socialgrowthengineers.com/";
const WAIT_UNTIL = "domcontentloaded" as const;
const SETTLE_MS = 1_500;

/** Pause helper that resolves after `ms` — lets client-rendered content settle. */
function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Best-effort login. Tries common email/password field shapes and a submit
 * button. Any failure is swallowed — the subsequent scrape will simply return
 * whatever the logged-out view exposes (often nothing, which yields []).
 *
 * TODO(selectors): replace these guesses with the real SGE login selectors.
 */
async function tryLogin(page: Page, email: string, password: string): Promise<void> {
  try {
    await page.goto(BASE_URL, { waitUntil: WAIT_UNTIL });
    await settle(SETTLE_MS);

    // Heuristic field discovery — match by type/name/placeholder.
    const emailSel = 'input[type="email"], input[name*="email" i], input[placeholder*="email" i]';
    const passSel =
      'input[type="password"], input[name*="pass" i], input[placeholder*="password" i]';

    const emailEl = await page.$(emailSel);
    const passEl = await page.$(passSel);
    if (!emailEl || !passEl) return; // no login form visible — skip

    await emailEl.type(email, { delay: 10 });
    await passEl.type(password, { delay: 10 });

    // Submit: prefer an explicit submit button, else press Enter.
    const submit = await page.$(
      'button[type="submit"], input[type="submit"], button[name*="login" i]',
    );
    if (submit) {
      await submit.click();
    } else {
      await passEl.press("Enter");
    }
    await settle(SETTLE_MS);
  } catch {
    // best-effort only
  }
}

interface RawCard {
  url: string;
  title: string | null;
  metric: string | null;
  thumbnail: string | null;
}

/**
 * In-page sweep for viral-post cards. Runs inside the browser context, so it
 * must be self-contained. Collects anchors whose href/text look like a content
 * entry and filters by the topic keyword.
 *
 * TODO(selectors): the live site likely wraps each viral post in a stable card
 * element (e.g. article[data-...]). Once known, scope the sweep to that and
 * read the real title/metric/thumbnail nodes instead of these heuristics.
 */
async function collectCards(page: Page, keyword: string, max: number): Promise<RawCard[]> {
  return page.evaluate(
    (kw: string, limit: number) => {
      const out: RawCard[] = [];
      const seen = new Set<string>();
      const lowerKw = kw.toLowerCase();

      const looksLikePost = (href: string): boolean =>
        /\/(post|posts|viral|content|video|reel|p)\//i.test(href);

      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
      for (const a of anchors) {
        const href = a.href;
        if (!href || seen.has(href)) continue;
        if (!looksLikePost(href)) continue;

        const card = a.closest("article, li, [class*='card']") ?? a.parentElement ?? a;
        const text = (card.textContent ?? "").trim();
        const title = (a.textContent ?? "").trim() || text.slice(0, 120) || null;

        // topic filter — keyword must appear in the card text or href
        if (lowerKw && !`${text} ${href}`.toLowerCase().includes(lowerKw)) continue;
        seen.add(href);

        // metric heuristic: a number+suffix near "views/likes/saves"
        const metricMatch = text.match(/([\d.,]+\s*[KMB]?)\s*(views|likes|saves|plays)/i);
        const img = card.querySelector("img");

        out.push({
          url: href,
          title,
          metric: metricMatch ? metricMatch[1].trim() : null,
          thumbnail: img?.getAttribute("src") ?? null,
        });
        if (out.length >= limit) break;
      }
      return out;
    },
    keyword,
    max,
  );
}

/**
 * Search SGE for viral posts relevant to `topic`. Best-effort login then a
 * resilient card sweep. Returns [] on any failure. Never throws.
 */
export async function searchSGE(topic: string, limit = 12): Promise<ResearchItem[]> {
  const email = process.env.SGE_EMAIL;
  const password = process.env.SGE_PASSWORD;
  const q = (topic ?? "").trim();
  if (!email || !password || !q) return [];

  // primary keyword for the in-page topic filter
  const keyword = q.split(/\s+/)[0]?.toLowerCase() ?? "";

  try {
    return await withLightpanda(async (page) => {
      await tryLogin(page, email, password);

      // Navigate to a search/explore surface for the topic.
      // TODO(selectors): confirm the real search route + query param. Common
      // shapes tried: ?q= and ?search=. Falls back to the explore landing.
      const searchUrl = `${BASE_URL}search?q=${encodeURIComponent(q)}`;
      try {
        await page.goto(searchUrl, { waitUntil: WAIT_UNTIL });
        await settle(SETTLE_MS);
      } catch {
        // ignore — try whatever the current page exposes
      }

      const cards = await collectCards(page, keyword, limit);
      return cards.map((c) => {
        const item: ResearchItem = {
          platform: "sge",
          url: c.url,
          title: c.title ?? undefined,
          thumbnail: c.thumbnail ?? undefined,
          views: c.metric ? parseCount(c.metric) : undefined,
          score: 0, // assigned by the orchestrator
        };
        return item;
      });
    });
  } catch {
    return [];
  }
}
