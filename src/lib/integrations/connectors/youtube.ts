// ============================================================
// YouTube connector — pulls TRENDING videos via the official
// YouTube Data API v3 (videos.list?chart=mostPopular). Only needs
// a YOUTUBE_API_KEY (no OAuth, no Lightpanda). Feeds the trends board
// for the strategist team. Never throws.
// ============================================================
import type { IntegrationConnector, SyncResult } from "../registry";
import { admin, nowIso } from "@/lib/supabase";

const REGION = process.env.YOUTUBE_REGION || "ID";
const MAX = 25;

interface YtThumb {
  url?: string;
}
interface YtItem {
  id?: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    categoryId?: string;
    thumbnails?: { high?: YtThumb; medium?: YtThumb; default?: YtThumb };
  };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
}
interface YtResponse {
  items?: YtItem[];
}

export class YoutubeConnector implements IntegrationConnector {
  readonly provider = "youtube" as const;

  isConfigured(): boolean {
    return !!process.env.YOUTUBE_API_KEY;
  }

  async sync(): Promise<SyncResult> {
    if (!this.isConfigured()) {
      return { provider: "youtube", ok: false, itemsSynced: 0, error: "YOUTUBE_API_KEY not set" };
    }
    try {
      const key = process.env.YOUTUBE_API_KEY as string;
      const url =
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics` +
        `&chart=mostPopular&regionCode=${REGION}&maxResults=${MAX}&key=${key}`;
      const res = await fetch(url);
      if (!res.ok) {
        return { provider: "youtube", ok: false, itemsSynced: 0, error: `YouTube API ${res.status}` };
      }
      const data = (await res.json()) as YtResponse;
      const items = data.items ?? [];
      const db = admin();
      let synced = 0;

      for (const it of items) {
        try {
          if (!it.id) continue;
          const sn = it.snippet ?? {};
          const st = it.statistics ?? {};
          const views = Number(st.viewCount ?? 0);
          const likes = Number(st.likeCount ?? 0);
          const comments = Number(st.commentCount ?? 0);
          const er = views > 0 ? Math.min(1, (likes + comments) / views) : 0;
          const contentUrl = `https://www.youtube.com/watch?v=${it.id}`;
          const thumb =
            sn.thumbnails?.high?.url ?? sn.thumbnails?.medium?.url ?? sn.thumbnails?.default?.url ?? null;

          const row = {
            platform: "youtube",
            content_url: contentUrl,
            thumbnail_url: thumb,
            views,
            likes,
            engagement_rate: er,
            content_category: sn.categoryId ?? null,
            hook_pattern: sn.title ?? null,
            emotional_angle: sn.channelTitle ?? null,
            format_type: "video",
            relevance_score: Math.min(1, (Math.log10(views + 1) / 8) * 0.6 + er * 0.4),
            status: "new",
            fetched_at: nowIso(),
          };

          // Emulated upsert on content_url (no unique constraint there).
          const { data: existing } = await db
            .from("trends")
            .select("id")
            .eq("content_url", contentUrl)
            .limit(1);
          if (existing && existing.length > 0) {
            await db.from("trends").update(row).eq("id", existing[0].id);
          } else {
            await db.from("trends").insert(row);
          }
          synced += 1;
        } catch {
          // skip a bad item, keep going
        }
      }

      return { provider: "youtube", ok: true, itemsSynced: synced, note: `YouTube trending (${REGION})` };
    } catch (e) {
      return {
        provider: "youtube",
        ok: false,
        itemsSynced: 0,
        error: e instanceof Error ? e.message : "youtube sync failed",
      };
    }
  }
}
