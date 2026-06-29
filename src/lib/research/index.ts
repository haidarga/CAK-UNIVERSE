// ============================================================
// Realtime topic-aware trend research orchestrator.
//
// A strategist types a TOPIC (e.g. "skincare lokal"). We fan out to every
// requested platform IN PARALLEL, scrape/search viral content RELEVANT to the
// topic, normalize into a single ResearchItem shape, score by reach +
// engagement + topic-match, dedup, and return ranked results.
//
// CONTRACT: this module NEVER throws to the caller. Each platform runs
// isolated under Promise.allSettled — one platform failing (login wall,
// missing API key, layout change) only records an entry in `errors` and the
// others still return their items.
//
// PLATFORM RELIABILITY NOTES:
//  - tiktok    — hashtag pages are semi-public; readable via a real Chrome/CDP
//                session. Usually returns items.
//  - youtube   — fully reliable when YOUTUBE_API_KEY is set (official API).
//  - instagram — explore/hashtag almost always needs a LOGGED-IN session.
//                Empty results are EXPECTED until a connected IG session's
//                cookies are present on the browser. Not a bug.
//  - sge        — socialgrowthengineers.com behind a login; best-effort, the
//                selectors need tuning against the live site (see sge.ts).
// ============================================================
import { scrapeTikTokHashtag } from "../integrations/scrapers/tiktok";
import { scrapeInstagramHashtag } from "../integrations/scrapers/instagram";
import { searchYouTube } from "./youtube-search";
import { searchSGE } from "../integrations/scrapers/sge";

export type Platform = "tiktok" | "instagram" | "youtube" | "sge";

export interface ResearchItem {
  platform: Platform;
  url: string;
  title?: string;
  thumbnail?: string;
  views?: number;
  likes?: number;
  engagementRate?: number;
  score: number;
}

const ALL_PLATFORMS: Platform[] = ["tiktok", "instagram", "youtube", "sge"];
const DEFAULT_LIMIT = 24;
const PER_PLATFORM_LIMIT = 12;

/**
 * Derive 1-3 hashtag-style tokens from a free-text topic.
 *   "skincare lokal" -> ["skincarelokal", "skincare", "lokal"]
 *   "Tabungan Anak!"  -> ["tabungananak", "tabungan", "anak"]
 * Lowercased, punctuation stripped, deduped, capped at 3.
 */
export function topicToTags(topic: string): string[] {
  const normalized = (topic ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
  if (!normalized) return [];

  const words = normalized.split(/\s+/).filter(Boolean);
  const joined = words.join("");
  const tags: string[] = [];

  // 1) the whole topic as a single hashtag token (e.g. "skincarelokal")
  if (joined) tags.push(joined);
  // 2) the individual words (e.g. "skincare", "lokal")
  for (const w of words) tags.push(w);

  // dedup preserving order, cap 3
  return Array.from(new Set(tags)).slice(0, 3);
}

/** Lowercase keyword set used for the topic-match scoring bonus. */
function topicKeywords(topic: string): string[] {
  return (topic ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

/** Does this item's title/url plausibly mention the topic? */
function matchesTopic(item: ResearchItem, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const haystack = `${item.title ?? ""} ${item.url}`.toLowerCase();
  return keywords.some((k) => haystack.includes(k));
}

/**
 * Score = log-scaled reach + engagement signal + topic-match bonus.
 * Bounded, monotonic, and stable so the sort is meaningful across platforms.
 */
function computeScore(item: ResearchItem, matched: boolean): number {
  const reach = item.views ? Math.log10(item.views + 1) : 0; // ~0..9
  const engagement = item.engagementRate ? Math.min(item.engagementRate, 0.5) * 20 : 0; // ~0..10
  const likeSignal = !item.views && item.likes ? Math.log10(item.likes + 1) : 0;
  const topicBonus = matched ? 5 : 0;
  return Number((reach + engagement + likeSignal + topicBonus).toFixed(3));
}

/** Fill engagementRate + score on a raw item (mutating a fresh copy). */
function finalize(item: ResearchItem, keywords: string[]): ResearchItem {
  const engagementRate =
    item.views && item.views > 0 && item.likes != null
      ? Number((item.likes / item.views).toFixed(4))
      : undefined;
  const withRate: ResearchItem = { ...item, engagementRate };
  return { ...withRate, score: computeScore(withRate, matchesTopic(withRate, keywords)) };
}

// --- per-platform adapters (each maps to ResearchItem; never throws) ---

async function fromTikTok(tag: string): Promise<ResearchItem[]> {
  const raw = await scrapeTikTokHashtag(tag, PER_PLATFORM_LIMIT);
  return raw.map((it) => ({
    platform: "tiktok" as const,
    url: it.url,
    views: it.views,
    thumbnail: it.thumbnail,
    score: 0,
  }));
}

async function fromInstagram(tag: string): Promise<ResearchItem[]> {
  const raw = await scrapeInstagramHashtag(tag, PER_PLATFORM_LIMIT);
  return raw.map((it) => ({
    platform: "instagram" as const,
    url: it.url,
    title: it.caption,
    views: it.views,
    likes: it.likes,
    thumbnail: it.thumbnail,
    score: 0,
  }));
}

async function fromYouTube(topic: string): Promise<ResearchItem[]> {
  return searchYouTube(topic, PER_PLATFORM_LIMIT);
}

async function fromSGE(topic: string): Promise<ResearchItem[]> {
  return searchSGE(topic, PER_PLATFORM_LIMIT);
}

/** Detect "empty because it needs login" so the UI can hint the operator. */
function emptyReason(platform: Platform): string {
  switch (platform) {
    case "instagram":
      return "perlu login (no connected session)";
    case "sge":
      return "perlu login / selectors belum di-tune";
    case "tiktok":
      return "no public results (or browser session unavailable)";
    case "youtube":
      return "no results (or YOUTUBE_API_KEY unset)";
  }
}

export interface ResearchResult {
  items: ResearchItem[];
  errors: Record<string, string>;
}

/**
 * Run topic research across the requested platforms in parallel and return
 * a single ranked list plus per-platform error notes. Never throws.
 */
export async function researchTopic(
  topic: string,
  opts?: { platforms?: Platform[]; limit?: number },
): Promise<ResearchResult> {
  const platforms = (opts?.platforms ?? ALL_PLATFORMS).filter((p): p is Platform =>
    ALL_PLATFORMS.includes(p),
  );
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const errors: Record<string, string> = {};

  const tags = topicToTags(topic);
  const primaryTag = tags[0] ?? "";
  const keywords = topicKeywords(topic);

  // Map each platform to an isolated task.
  const tasks = platforms.map((platform): Promise<ResearchItem[]> => {
    switch (platform) {
      case "tiktok":
        return fromTikTok(primaryTag);
      case "instagram":
        return fromInstagram(primaryTag);
      case "youtube":
        return fromYouTube(topic);
      case "sge":
        return fromSGE(topic);
    }
  });

  const settled = await Promise.allSettled(tasks);

  const collected: ResearchItem[] = [];
  settled.forEach((result, i) => {
    const platform = platforms[i];
    if (result.status === "rejected") {
      // Adapters are written never to throw, but guard anyway.
      errors[platform] =
        result.reason instanceof Error ? result.reason.message : "scrape failed";
      return;
    }
    if (result.value.length === 0) {
      errors[platform] = emptyReason(platform);
      return;
    }
    collected.push(...result.value);
  });

  // Score, dedup by url (keep highest-scoring), sort, cap.
  const byUrl = new Map<string, ResearchItem>();
  for (const raw of collected) {
    if (!raw.url) continue;
    const item = finalize(raw, keywords);
    const existing = byUrl.get(item.url);
    if (!existing || item.score > existing.score) byUrl.set(item.url, item);
  }

  const items = Array.from(byUrl.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { items, errors };
}
