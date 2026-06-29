// ============================================================
// Lightpanda connector — REAL.
//
// Drives a CDP-compatible headless browser (Lightpanda; see browser.ts) to
// scrape PUBLIC TikTok data into the CIH:
//   - hashtag pages  -> `trends` rows (viral content DB)
//   - profile pages  -> refreshed `accounts` metrics
//
// Run the engine first:
//     lightpanda serve --host 127.0.0.1 --port 9222
//     LIGHTPANDA_CDP_URL=ws://127.0.0.1:9222
//
// CONTRACT: sync() never throws. Each scrape is isolated so a single failure
// degrades to partial results instead of aborting the whole run; errors/notes
// are surfaced in the returned SyncResult.
// ============================================================
import { admin, nowIso } from "@/lib/supabase";
import type { IntegrationConnector, SyncResult } from "../registry";
import { scrapeTikTokHashtag, scrapeTikTokProfile } from "../scrapers/tiktok";

/** Fallback hashtags when no brand-derived tags are available. */
const DEFAULT_TAGS = ["fyp", "viral", "tiktokmademebuyit"];
/** Caps to keep a single sync run bounded (Lightpanda is fast but serial). */
const MAX_TAGS = 4;
const ITEMS_PER_TAG = 10;
const MAX_ACCOUNTS = 6;

interface BrandRow {
  id: string;
  hashtag_sets: unknown;
  status: string | null;
}

interface AccountRow {
  id: string;
  username: string;
  brand_id: string | null;
}

export class LightpandaConnector implements IntegrationConnector {
  // The data this produces lands on the TikTok surfaces (Trends + Account
  // Monitor), so report under the "tiktok" ProviderId.
  readonly provider = "tiktok" as const;

  isConfigured(): boolean {
    return !!process.env.LIGHTPANDA_CDP_URL;
  }

  async sync(): Promise<SyncResult> {
    if (!this.isConfigured()) {
      return { provider: this.provider, ok: false, itemsSynced: 0, error: "LIGHTPANDA_CDP_URL not set" };
    }

    const notes: string[] = [];
    let itemsSynced = 0;

    const tags = await this.resolveTags(notes);
    itemsSynced += await this.syncTrends(tags, notes);
    itemsSynced += await this.syncAccounts(notes);

    return {
      provider: this.provider,
      ok: true,
      itemsSynced,
      note: notes.join(" | ") || "no items scraped",
    };
  }

  /** Distinct hashtags from active brands' hashtag_sets, else DEFAULT_TAGS. */
  private async resolveTags(notes: string[]): Promise<string[]> {
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

  /** Scrape each tag and upsert results into `trends`. Returns count upserted. */
  private async syncTrends(tags: string[], notes: string[]): Promise<number> {
    let synced = 0;
    for (const tag of tags) {
      try {
        const items = await scrapeTikTokHashtag(tag, ITEMS_PER_TAG);
        if (items.length === 0) {
          notes.push(`#${tag}: 0 items`);
          continue;
        }
        const db = admin();
        for (const item of items) {
          const row = {
            platform: "tiktok",
            content_url: item.url,
            thumbnail_url: item.thumbnail ?? null,
            views: item.views ?? 0,
            content_category: tag,
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
        }
        notes.push(`#${tag}: ${items.length} scraped`);
      } catch (e) {
        notes.push(`#${tag} failed: ${errMsg(e)}`);
      }
    }
    return synced;
  }

  /** Refresh metrics for a few active tiktok accounts via profile scrape. */
  private async syncAccounts(notes: string[]): Promise<number> {
    let updated = 0;
    let accounts: AccountRow[] = [];
    try {
      const { data } = await admin()
        .from("accounts")
        .select("id, username, brand_id")
        .eq("platform", "tiktok")
        .eq("status", "active")
        .limit(MAX_ACCOUNTS);
      accounts = (data ?? []) as AccountRow[];
    } catch (e) {
      notes.push(`account-load failed: ${errMsg(e)}`);
      return 0;
    }

    for (const acct of accounts) {
      try {
        const stats = await scrapeTikTokProfile(acct.username);
        if (!stats) {
          notes.push(`@${acct.username}: no stats`);
          continue;
        }
        const patch: Record<string, unknown> = { last_scraped_at: nowIso() };
        if (stats.followers !== undefined) patch.follower_count = stats.followers;
        if (stats.following !== undefined) patch.following_count = stats.following;
        if (stats.totalPosts !== undefined) patch.total_posts = stats.totalPosts;
        const { error } = await admin().from("accounts").update(patch).eq("id", acct.id);
        if (!error) updated += 1;
      } catch (e) {
        notes.push(`@${acct.username} failed: ${errMsg(e)}`);
      }
    }
    if (accounts.length > 0) notes.push(`accounts refreshed: ${updated}/${accounts.length}`);
    return updated;
  }
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
