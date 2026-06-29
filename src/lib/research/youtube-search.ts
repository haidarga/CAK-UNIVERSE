// ============================================================
// YouTube topic search via the official YouTube Data API v3.
//
// Two-step query:
//   1) search.list — find the top videos for the topic, ordered by view count
//   2) videos.list — hydrate those ids with statistics (views/likes) + snippet
//
// Fully reliable when YOUTUBE_API_KEY is set. Returns [] (never throws) when
// the key is unset, the quota is exhausted, or the API errors.
// ============================================================
import type { ResearchItem } from "./index";
import { parseCount } from "../integrations/scrapers/util";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const FETCH_TIMEOUT_MS = 12_000;

// --- minimal typed shapes for the slices of the API we consume ---

interface SearchItem {
  id?: { videoId?: string };
}
interface SearchResponse {
  items?: SearchItem[];
}

interface VideoThumbnail {
  url?: string;
}
interface VideoSnippet {
  title?: string;
  thumbnails?: {
    medium?: VideoThumbnail;
    high?: VideoThumbnail;
    default?: VideoThumbnail;
  };
}
interface VideoStatistics {
  viewCount?: string;
  likeCount?: string;
}
interface VideoItem {
  id?: string;
  snippet?: VideoSnippet;
  statistics?: VideoStatistics;
}
interface VideosResponse {
  items?: VideoItem[];
}

/** fetch JSON with a timeout; returns null on any failure. */
async function getJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function pickThumbnail(snippet?: VideoSnippet): string | undefined {
  const t = snippet?.thumbnails;
  return t?.high?.url ?? t?.medium?.url ?? t?.default?.url;
}

/**
 * Search YouTube for the topic, ordered by view count, and map results to
 * ResearchItem with view/like counts. Returns [] if YOUTUBE_API_KEY is unset
 * or any request fails. Never throws.
 */
export async function searchYouTube(topic: string, limit = 12): Promise<ResearchItem[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  const q = (topic ?? "").trim();
  if (!q) return [];

  const maxResults = Math.min(Math.max(limit, 1), 50);

  // 1) search.list — top videos by view count for the topic
  const searchUrl =
    `${SEARCH_URL}?part=snippet&type=video&order=viewCount` +
    `&maxResults=${maxResults}&q=${encodeURIComponent(q)}&key=${key}`;
  const search = await getJson<SearchResponse>(searchUrl);
  if (!search?.items?.length) return [];

  const ids = search.items
    .map((it) => it.id?.videoId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  // 2) videos.list — hydrate statistics + snippet for ranking
  const videosUrl =
    `${VIDEOS_URL}?part=statistics,snippet&id=${ids.join(",")}&key=${key}`;
  const videos = await getJson<VideosResponse>(videosUrl);
  if (!videos?.items?.length) return [];

  return videos.items
    .filter((v): v is VideoItem & { id: string } => Boolean(v.id))
    .map((v) => {
      const views = v.statistics?.viewCount ? parseCount(v.statistics.viewCount) : undefined;
      const likes = v.statistics?.likeCount ? parseCount(v.statistics.likeCount) : undefined;
      const item: ResearchItem = {
        platform: "youtube",
        url: `https://www.youtube.com/watch?v=${v.id}`,
        title: v.snippet?.title,
        thumbnail: pickThumbnail(v.snippet),
        views,
        likes,
        score: 0, // assigned by the orchestrator
      };
      return item;
    });
}
