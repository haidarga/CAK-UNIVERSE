// ============================================================
// ScrapeCreators adapter — OPT-IN provider for TikTok keyword/hashtag search
// and Instagram hashtag posts. One server key serves every user (no personal
// login, works on Vercel serverless). Off by default: only used when
// SCRAPECREATORS_API_KEY is set.
//
// Free tier is small (a few hundred calls) then pay-per-use — hence opt-in.
// Docs: https://docs.scrapecreators.com  ·  auth: x-api-key header.
// Response schemas vary, so parsing is defensive across common field shapes.
// Never throws; returns [] on any error.
// ============================================================
import type { ResearchItem } from "./index";

const KEY = process.env.SCRAPECREATORS_API_KEY;
const BASE = "https://api.scrapecreators.com";
const TIMEOUT_MS = 20_000;

export function scrapeCreatorsEnabled(): boolean {
  return !!KEY;
}

type Row = Record<string, unknown>;
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}
function get(o: unknown, ...keys: string[]): unknown {
  let cur: unknown = o;
  for (const k of keys) {
    if (cur && typeof cur === "object" && k in (cur as Row)) cur = (cur as Row)[k];
    else return undefined;
  }
  return cur;
}
/** Find the first array of records anywhere in a small response object. */
function firstArray(obj: unknown, depth = 0): Row[] {
  if (depth > 4 || !obj || typeof obj !== "object") return [];
  if (Array.isArray(obj)) return obj.filter((x) => x && typeof x === "object") as Row[];
  for (const v of Object.values(obj as Row)) {
    const found = firstArray(v, depth + 1);
    if (found.length) return found;
  }
  return [];
}

async function call(path: string): Promise<Row[]> {
  if (!KEY) return [];
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "x-api-key": KEY, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    return firstArray(await res.json());
  } catch {
    return [];
  }
}

function engagement(views?: number, likes?: number, comments?: number): number | undefined {
  if (!views || views <= 0) return undefined;
  return Math.min(1, ((likes ?? 0) + (comments ?? 0)) / views);
}

/** Map a TikTok-ish row (aweme/native or flattened) to a ResearchItem. */
function mapTikTok(r: Row): ResearchItem | null {
  const stats = (get(r, "statistics") ?? get(r, "stats") ?? r) as Row;
  const url =
    str(get(r, "share_url")) ||
    str(get(r, "video_url")) ||
    str(get(r, "aweme_info", "share_url")) ||
    str(get(r, "url"));
  if (!url) return null;
  const views = num(get(stats, "play_count")) ?? num(get(r, "playCount")) ?? num(get(r, "views"));
  const likes = num(get(stats, "digg_count")) ?? num(get(r, "diggCount")) ?? num(get(r, "likes"));
  const comments = num(get(stats, "comment_count")) ?? num(get(r, "commentCount"));
  const thumb =
    str(get(r, "video", "cover")) ||
    str(get(r, "cover")) ||
    str(get(r, "thumbnail")) ||
    str(get(r, "originCover"));
  return {
    platform: "tiktok",
    url,
    title: str(get(r, "desc")) || str(get(r, "text")) || str(get(r, "title")),
    thumbnail: thumb,
    views,
    likes,
    engagementRate: engagement(views, likes, comments),
    score: 0,
  };
}

/** Map an Instagram-ish row to a ResearchItem. */
function mapInstagram(r: Row): ResearchItem | null {
  const code = str(get(r, "code")) || str(get(r, "shortcode")) || str(get(r, "shortCode"));
  const url = str(get(r, "url")) || (code ? `https://www.instagram.com/p/${code}/` : undefined);
  if (!url) return null;
  const views = num(get(r, "video_view_count")) ?? num(get(r, "videoViewCount")) ?? num(get(r, "play_count"));
  const likes = num(get(r, "like_count")) ?? num(get(r, "likesCount")) ?? num(get(r, "likes"));
  const comments = num(get(r, "comment_count")) ?? num(get(r, "commentsCount"));
  const caption =
    str(get(r, "caption")) ||
    str(get(r, "caption", "text")) ||
    str(get(r, "edge_media_to_caption", "edges", "0", "node", "text"));
  return {
    platform: "instagram",
    url,
    title: caption,
    thumbnail: str(get(r, "display_url")) || str(get(r, "displayUrl")) || str(get(r, "thumbnail_url")),
    views,
    likes,
    engagementRate: engagement(views, likes, comments),
    score: 0,
  };
}

export async function scTikTokSearch(query: string): Promise<ResearchItem[]> {
  const rows = await call(`/v1/tiktok/search/keyword?keyword=${encodeURIComponent(query)}`);
  return rows.map(mapTikTok).filter((x): x is ResearchItem => x !== null);
}

export async function scTikTokHashtag(tag: string): Promise<ResearchItem[]> {
  const rows = await call(`/v1/tiktok/search/hashtag?hashtag=${encodeURIComponent(tag)}`);
  return rows.map(mapTikTok).filter((x): x is ResearchItem => x !== null);
}

export async function scInstagramHashtag(tag: string): Promise<ResearchItem[]> {
  const rows = await call(`/v1/instagram/search/hashtag?hashtag=${encodeURIComponent(tag)}`);
  return rows.map(mapInstagram).filter((x): x is ResearchItem => x !== null);
}
