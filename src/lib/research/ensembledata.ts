// ============================================================
// EnsembleData adapter — FREE recurring tier for TikTok search.
//
// Free plan: 50 units/day, no credit card, resets daily (better cadence than
// a one-time signup bonus). 1 unit = up to 20 posts. Covers TikTok keyword +
// hashtag search with a real REST API (not actor/browser-based → fast).
//
// NOTE: EnsembleData's Instagram endpoints are user-post-centric (getUserPosts,
// getUserReels, ...) with NO hashtag-discovery endpoint — so this only powers
// TikTok. Instagram search still needs ScrapeCreators (see scrapecreators.ts).
//
// Opt-in: only used when ENSEMBLEDATA_TOKEN is set. Never throws; returns []
// on any error so the orchestrator degrades gracefully.
// Docs: https://ensembledata.com/apis/docs
// ============================================================
import type { ResearchItem } from "./index";

const TOKEN = process.env.ENSEMBLEDATA_TOKEN;
const BASE = "https://ensembledata.com/apis";
const TIMEOUT_MS = 15_000;

export function ensembleDataEnabled(): boolean {
  return !!TOKEN;
}

type Row = Record<string, unknown>;

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}
function engagement(views?: number, likes?: number, comments?: number): number | undefined {
  if (!views || views <= 0) return undefined;
  return Math.min(1, ((likes ?? 0) + (comments ?? 0)) / views);
}

interface Envelope {
  data?: { data?: Row[]; nextCursor?: number };
}

async function call(path: string, params: Record<string, string>): Promise<Row[]> {
  if (!TOKEN) return [];
  const qs = new URLSearchParams({ ...params, token: TOKEN, cursor: "0" });
  try {
    const res = await fetch(`${BASE}${path}?${qs}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as Envelope;
    return Array.isArray(json.data?.data) ? json.data!.data! : [];
  } catch {
    return [];
  }
}

function mapPost(r: Row): ResearchItem | null {
  const url = str(r.share_url);
  if (!url) return null;
  const stats = (r.statistics as Row) ?? {};
  const video = (r.video as Row) ?? {};
  const cover = (video.cover as Row) ?? {};
  const urlList = cover.url_list as unknown;
  const thumbnail = Array.isArray(urlList) ? str(urlList[0]) : undefined;

  const views = num(stats.play_count);
  const likes = num(stats.digg_count);
  const comments = num(stats.comment_count);

  return {
    platform: "tiktok",
    url,
    title: str(r.desc),
    thumbnail,
    views,
    likes,
    engagementRate: engagement(views, likes, comments),
    score: 0, // scored by the orchestrator
  };
}

export async function edTikTokKeyword(query: string): Promise<ResearchItem[]> {
  const rows = await call("/tt/keyword/posts", { keyword: query });
  return rows.map(mapPost).filter((x): x is ResearchItem => x !== null);
}

export async function edTikTokHashtag(tag: string): Promise<ResearchItem[]> {
  const rows = await call("/tt/hashtag/posts", { name: tag });
  return rows.map(mapPost).filter((x): x is ResearchItem => x !== null);
}
