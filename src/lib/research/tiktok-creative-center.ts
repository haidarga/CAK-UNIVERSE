// ============================================================
// TikTok Creative Center — FREE, keyless trending source.
//
// Creative Center is TikTok's own public marketing/research site. Its backend
// (creative_radar_api) serves trending hashtags publicly, no login and no
// personal account involved — so there's nothing to get banned. This reads
// PUBLIC trend data server-side at low volume.
//
// Unofficial (not a documented public API): TikTok can change/rate-limit it.
// Every failure path returns [] so the orchestrator degrades gracefully — worst
// case: no TikTok results, never a crash. Keep volume modest (cached upstream).
// ============================================================
import type { ResearchItem } from "./index";

const BASE = "https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list";
const COUNTRY = process.env.TIKTOK_CC_COUNTRY || "ID"; // default Indonesia
const PERIOD = 7; // 7 | 30 | 120 days
const TIMEOUT_MS = 12_000;

// A realistic desktop UA — the endpoint expects a browser-like caller.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type Row = Record<string, unknown>;
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

/**
 * Fetch top trending TikTok hashtags for the configured country. Returns items
 * shaped for the orchestrator (score 0 — it scores/ranks by topic relevance).
 */
export async function tiktokCreativeCenterHashtags(limit = 20): Promise<ResearchItem[]> {
  const url =
    `${BASE}?page=1&limit=${Math.min(limit, 50)}&period=${PERIOD}` +
    `&country_code=${encodeURIComponent(COUNTRY)}&sort_by=popular`;
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9,id;q=0.8",
        referer: "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { code?: number; data?: { list?: Row[] } };
    // Non-zero code (signing required / rate-limited / region-blocked) → empty.
    if (json.code !== undefined && json.code !== 0) return [];
    const list = Array.isArray(json.data?.list) ? (json.data!.list as Row[]) : [];
    return list
      .map((r): ResearchItem | null => {
        const name = str(r.hashtag_name);
        if (!name) return null;
        const views = num(r.video_views);
        return {
          platform: "tiktok",
          url: `https://www.tiktok.com/tag/${encodeURIComponent(name)}`,
          title: `#${name}`,
          views,
          // publish_cnt = how many videos use the tag; a rough "activity" proxy.
          likes: num(r.publish_cnt),
          score: 0, // scored by the orchestrator (topic-match boosts relevant tags)
        };
      })
      .filter((x): x is ResearchItem => x !== null);
  } catch {
    return [];
  }
}
