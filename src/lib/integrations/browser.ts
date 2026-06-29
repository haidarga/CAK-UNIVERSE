// ============================================================
// Lightpanda browser session helper.
//
// Lightpanda (https://lightpanda.io) is a lightweight, headless browser that
// speaks the Chrome DevTools Protocol (CDP). Run it as a server:
//
//     lightpanda serve --host 127.0.0.1 --port 9222
//
// then point LIGHTPANDA_CDP_URL at the websocket endpoint, e.g.
//     LIGHTPANDA_CDP_URL=ws://127.0.0.1:9222
//
// withLightpanda() connects puppeteer-core to that endpoint, opens a fresh
// page, runs the callback, and ALWAYS tears down the page + connection in a
// finally block so a connection is never leaked. Because Lightpanda is
// CDP-compatible, the exact same code runs against a real Chrome during dev
// (`chrome --remote-debugging-port=9222` exposes a ws endpoint too).
// ============================================================
import puppeteer from "puppeteer-core";
import type { Browser, Page } from "puppeteer-core";

/** Default navigation timeout (ms) for scraper pages. */
export const NAV_TIMEOUT_MS = 30_000;

/**
 * Connect to Lightpanda over CDP, run `fn` with a fresh page, and always
 * clean up. Throws only if LIGHTPANDA_CDP_URL is unset or the connection
 * itself fails — callers (connectors/scrapers) are expected to catch.
 */
export async function withLightpanda<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const endpoint = process.env.LIGHTPANDA_CDP_URL;
  if (!endpoint) {
    throw new Error("LIGHTPANDA_CDP_URL not set — start `lightpanda serve` and set the ws endpoint");
  }

  let browser: Browser | null = null;
  let page: Page | null = null;
  try {
    // Support both endpoint styles:
    //  - http(s)://host:port  → a real Chrome's DevTools (auto-discovers the ws url)
    //  - ws://host:port       → Lightpanda / a direct CDP websocket
    const isHttp = /^https?:\/\//i.test(endpoint);
    browser = await puppeteer.connect(
      isHttp ? { browserURL: endpoint } : { browserWSEndpoint: endpoint },
    );
    page = await browser.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    page.setDefaultTimeout(NAV_TIMEOUT_MS);
    return await fn(page);
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    if (browser) {
      // disconnect detaches our client without killing the shared Lightpanda
      // server, which may be serving other concurrent sessions.
      browser.disconnect();
    }
  }
}
