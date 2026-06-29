// ============================================================
// Client for the optional Python scraper sidecar (TikTok-Api + instagrapi).
// Opt-in: only used when SCRAPER_SERVICE_URL is set. Returns ResearchItem-ish
// rows (without score — the orchestrator scores them). Never throws.
// ============================================================
import type { ResearchItem } from "./index";

const BASE = process.env.SCRAPER_SERVICE_URL;
const TOKEN = process.env.SCRAPER_SERVICE_TOKEN;

export function scraperServiceEnabled(): boolean {
  return !!BASE;
}

interface SvcItem {
  platform: "tiktok" | "instagram";
  url: string;
  title?: string;
  thumbnail?: string;
  views?: number;
  likes?: number;
  comments?: number;
}
interface SvcResponse {
  ok: boolean;
  items?: SvcItem[];
  error?: string;
}

async function call(path: string): Promise<ResearchItem[]> {
  if (!BASE) return [];
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: TOKEN ? { "x-service-token": TOKEN } : {},
      // realtime; don't cache
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as SvcResponse;
    if (!json.ok || !json.items) return [];
    return json.items
      .filter((it) => it.url)
      .map((it) => {
        const views = it.views ?? 0;
        const likes = it.likes ?? 0;
        const er = views > 0 ? Math.min(1, (likes + (it.comments ?? 0)) / views) : 0;
        return {
          platform: it.platform,
          url: it.url,
          title: it.title,
          thumbnail: it.thumbnail,
          views,
          likes,
          engagementRate: er,
          score: 0, // scored by the orchestrator
        } satisfies ResearchItem;
      });
  } catch {
    return [];
  }
}

export const svcTikTokHashtag = (tag: string) =>
  call(`/tiktok/hashtag?tag=${encodeURIComponent(tag)}&count=24`);
export const svcTikTokSearch = (q: string) =>
  call(`/tiktok/search?q=${encodeURIComponent(q)}&count=24`);
export const svcInstagramHashtag = (tag: string) =>
  call(`/instagram/hashtag?tag=${encodeURIComponent(tag)}&amount=24`);
