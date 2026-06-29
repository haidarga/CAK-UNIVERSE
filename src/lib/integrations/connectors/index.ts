// ============================================================
// Connector registry — maps each ProviderId to its connector instance.
// getConnector(provider) is the single entry point used by the sync API
// route and the github-sync cron.
// ============================================================
import type { IntegrationConnector, ProviderId } from "../registry";
import { GithubConnector } from "./github";
import { LightpandaConnector } from "./lightpanda";
import {
  YouTubeConnector,
  SocialGrowthEngineerConnector,
  PostizConnector,
  GoogleDocsConnector,
  GoogleSheetsConnector,
  GoogleDriveConnector,
  AnalyticsConnector,
} from "./social";

const CONNECTORS: Record<ProviderId, () => IntegrationConnector> = {
  github: () => new GithubConnector(),
  // TikTok + Instagram both run the Lightpanda browser scrape (no API keys).
  // The constructor arg controls which ProviderId the SyncResult reports under.
  tiktok: () => new LightpandaConnector("tiktok"),
  instagram: () => new LightpandaConnector("instagram"),
  youtube: () => new YouTubeConnector(),
  social_growth_engineer: () => new SocialGrowthEngineerConnector(),
  postiz: () => new PostizConnector(),
  google_docs: () => new GoogleDocsConnector(),
  google_sheets: () => new GoogleSheetsConnector(),
  google_drive: () => new GoogleDriveConnector(),
  analytics: () => new AnalyticsConnector(),
};

/** Resolve a connector instance for a provider, or null if unknown. */
export function getConnector(provider: ProviderId): IntegrationConnector | null {
  const factory = CONNECTORS[provider];
  return factory ? factory() : null;
}
