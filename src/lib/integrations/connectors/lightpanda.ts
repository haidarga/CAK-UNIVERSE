// ============================================================
// Lightpanda connector — REAL, unified browser scrape (NO API keys).
//
// Drives a CDP-compatible headless browser (Lightpanda; see browser.ts) to
// scrape VIRAL / TRENDING / HIGH-ENGAGEMENT content from BOTH platforms into
// the `trends` table:
//   - TikTok  hashtag pages -> `trends` rows (platform "tiktok")
//   - Instagram explore + hashtag pages -> `trends` rows (platform "instagram")
//
// Run the engine first (logged-in account assumed for Instagram, see the
// scraper TODO(login) block):
//     lightpanda serve --host 127.0.0.1 --port 9222
//     LIGHTPANDA_CDP_URL=ws://127.0.0.1:9222
//
// CONTRACT: nothing here throws to the caller. Every scrape is isolated so a
// single platform/tag failure degrades to partial results; errors/notes are
// surfaced in the returned SyncResult or swallowed inside scrapeAllTrends().
// ============================================================
import { admin, nowIso } from "@/lib/supabase";
import type { IntegrationConnector, ProviderId, SyncResult } from "../registry";
import { scrapeTikTokHashtag } from "../scrapers/tiktok";
import {
  scrapeInstagramHashtag,
  scrapeInstagramReelsExplore,
  type InstagramItem,
} from "../scrapers/instagram";

/** Fallback hashtags when no brand-derived tags are available. */
const DEFAULT_TAGS = ["fyp", "viral", "trending"];
/** Caps to keep a single sync run bounded (Lightpanda is fast but serial). */
const MAX_TAGS = 4;
const ITEMS_PER_TAG = 10;
const EXPLORE_LIMIT = 18;
/** Assumed denominator when a platform exposes no follower/reach signal. */
const ENGAGEMENT_BASELINE_VIEWS = 1;

type Platform = "tiktok" | "instagram";

interface BrandRow {
  id: string;
  hashtag_sets: unknown;
  status: string | null;
}

/** Normalized scrape item from either platform before it becomes a trends row. */
interface TrendItem {
  platform: Platform;
  url: string;
  views: number;
  likes: number;
  shares: number;
  thumbnail: string | null;
  caption: string | null;
  category: string;
}

export class LightpandaConnector implements IntegrationConnector {
  // The browser scrape feeds both TikTok and Instagram trends, but the
  // SyncResult must report under a single ProviderId. Report under whichever
  // provider the caller is syncing (defaults to "tiktok").
  readonly provider: ProviderId;

  constructor(provider: ProviderId = "tiktok") {
    this.provider = provider;
  }

  isConfigured(): boolean {
    return !!process.env.LIGHTPANDA_CDP_URL;
  }

  async sync(): Promise<SyncResult> {
    if (!this.isConfigured()) {
      return {
        provider: this.provider,
        ok: false,
        itemsSynced: 0,
        error: "LIGHTPANDA_CDP_URL not set",
      };
    }

    const { itemsSynced, notes } = await scrapeAllTrends();
    return {
      provider: this.provider,
      ok: true,
      itemsSynced,
      note: notes.join(" | ") || "no items scraped",
    };
  }
}

/**
 * Scrape TikTok + Instagram for trending/high-engagement items and upsert
 * them into `trends`. Each platform/tag is isolated in try/catch; partial
 * results are kept; NEVER throws.
 *
 * @returns total rows upserted plus a human-readable note breakdown.
 */
export async function scrapeAllTrends(): Promise<{ itemsSynced: number; notes: string[] }> {
  const notes: string[] = [];
  const tags = await resolveTags(notes);

  const collected: TrendItem[] = [];
  collected.push(...(await collectTikTok(tags, notes)));
  collected.push(...(await collectInstagram(tags, notes)));

  const itemsSynced = await upsertTrends(collected, notes);
  return { itemsSynced, notes };
}

/** Distinct hashtags from active brands' hashtag_sets, else DEFAULT_TAGS. */
async function resolveTags(notes: string[]): Promise<string[]> {
  try {
    const { data } = await admin()
      .from("brands")
      .select("id, hashtag_sets, status")
      .eq("status", "active");
    const brands = (data ?? []) as BrandRow[];
    const tags = new Set<string>();
    for (const b of brands) {
      for (const t of flattenTags(b.hashtag_sets)) tags.add(t);
    }
    if (tags.size > 0) return Array.from(tags).slice(0, MAX_TAGS);
  } catch (e) {
    notes.push(`tag-resolve failed: ${errMsg(e)}`);
  }
  return DEFAULT_TAGS.slice(0, MAX_TAGS);
}

/** Scrape each hashtag on TikTok. Returns normalized TrendItems. */
async function collectTikTok(tags: string[], notes: string[]): Promise<TrendItem[]> {
  const out: TrendItem[] = [];
  for (const tag of tags) {
    try {
      const items = await scrapeTikTokHashtag(tag, ITEMS_PER_TAG);
      for (const it of items) {
        const views = it.views ?? 0;
        out.push({
          platform: "tiktok",
          url: it.url,
          views,
          likes: 0, // hashtag grid does not expose per-video likes
          shares: 0,
          thumbnail: it.thumbnail ?? null,
          caption: null,
          category: tag,
        });
      }
      notes.push(`tiktok #${tag}: ${items.length}`);
    } catch (e) {
      notes.push(`tiktok #${tag} failed: ${errMsg(e)}`);
    }
  }
  return out;
}

/** Scrape IG explore (trending) + each hashtag. Returns normalized TrendItems. */
async function collectInstagram(tags: string[], notes: string[]): Promise<TrendItem[]> {
  const out: TrendItem[] = [];

  try {
    const explore = await scrapeInstagramReelsExplore(EXPLORE_LIMIT);
    for (const it of explore) out.push(mapIgItem(it, "explore"));
    notes.push(`instagram explore: ${explore.length}`);
  } catch (e) {
    notes.push(`instagram explore failed: ${errMsg(e)}`);
  }

  for (const tag of tags) {
    try {
      const items = await scrapeInstagramHashtag(tag, ITEMS_PER_TAG);
      for (const it of items) out.push(mapIgItem(it, tag));
      notes.push(`instagram #${tag}: ${items.length}`);
    } catch (e) {
      notes.push(`instagram #${tag} failed: ${errMsg(e)}`);
    }
  }
  return out;
}

/** Normalize an InstagramItem into a TrendItem under `category`. */
function mapIgItem(it: InstagramItem, category: string): TrendItem {
  return {
    platform: "instagram",
    url: it.url,
    views: it.views ?? 0,
    likes: it.likes ?? 0,
    shares: 0,
    thumbnail: it.thumbnail ?? null,
    caption: it.caption ?? null,
    category,
  };
}

/** Upsert TrendItems into `trends` (emulated upsert keyed on content_url). */
async function upsertTrends(items: TrendItem[], notes: string[]): Promise<number> {
  if (items.length === 0) return 0;
  const db = admin();
  let synced = 0;
  for (const item of items) {
    try {
      const row = {
        platform: item.platform,
        content_url: item.url,
        thumbnail_url: item.thumbnail,
        views: item.views,
        likes: item.likes,
        shares: item.shares,
        engagement_rate: engagementRate(item),
        relevance_score: relevanceScore(item),
        content_category: item.category,
        status: "new",
        fetched_at: nowIso(),
      };
      // trends has no unique constraint on content_url; emulate upsert.
      const { data: existing } = await db
        .from("trends")
        .select("id")
        .eq("content_url", item.url)
        .maybeSingle();
      const { error } = existing?.id
        ? await db.from("trends").update(row).eq("id", existing.id)
        : await db.from("trends").insert(row);
      if (!error) synced += 1;
    } catch (e) {
      notes.push(`upsert failed (${item.url}): ${errMsg(e)}`);
    }
  }
  notes.push(`upserted: ${synced}/${items.length}`);
  return synced;
}

/**
 * Simple engagement_rate = (likes + shares) / max(views, 1), clamped to [0,1].
 * Falls back to 0 when we have no interaction signal at all.
 */
function engagementRate(item: TrendItem): number {
  const interactions = item.likes + item.shares;
  if (interactions <= 0) return 0;
  const denom = Math.max(item.views, ENGAGEMENT_BASELINE_VIEWS);
  return Math.min(interactions / denom, 1);
}

/**
 * Simple relevance_score: log-scaled reach blended with engagement so that
 * both very-viewed and highly-engaging items surface. Range roughly [0, 1].
 */
function relevanceScore(item: TrendItem): number {
  // log10(views) maxes out around 9 (a billion views); normalize against that.
  const reach = item.views > 0 ? Math.min(Math.log10(item.views) / 9, 1) : 0;
  const engagement = engagementRate(item);
  return Number((reach * 0.6 + engagement * 0.4).toFixed(4));
}

/** Normalize a brand's hashtag_sets jsonb (array | array-of-arrays | string). */
function flattenTags(raw: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown): void => {
    if (typeof v === "string") {
      const t = v.replace(/^#/, "").trim();
      if (t) out.push(t);
    } else if (Array.isArray(v)) {
      for (const item of v) visit(item);
    }
  };
  visit(raw);
  return out;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "unknown error";
}
