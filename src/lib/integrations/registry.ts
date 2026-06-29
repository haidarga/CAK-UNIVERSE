// ============================================================
// Integration registry — the catalog of external tools the platform
// embeds, plus the connector contract each provider implements.
// UI reads PROVIDERS to render the integrations hub; backend connectors
// implement IntegrationConnector to sync data / push content.
// ============================================================

export type ProviderId =
  | "google_docs"
  | "google_sheets"
  | "google_drive"
  | "tiktok"
  | "instagram"
  | "youtube"
  | "social_growth_engineer"
  | "github"
  | "postiz"
  | "analytics";

export type ProviderCategory = "docs" | "social" | "growth" | "dev" | "analytics" | "publishing";

// "browser" = authenticated headless-browser login (Lightpanda/CDP), no API key.
export type AuthKind = "oauth" | "api_key" | "none" | "browser";

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  category: ProviderCategory;
  /** lucide-react icon name used by the UI. */
  icon: string;
  auth: AuthKind;
  /** What working surfaces this powers, for the integrations hub copy. */
  capabilities: string[];
  /** Env vars that must be set before this can actually connect. */
  envVars: string[];
  /** Where it embeds in the platform. */
  surfaces: string[];
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: "google_docs",
    label: "Google Docs",
    category: "docs",
    icon: "FileText",
    auth: "oauth",
    capabilities: ["Open/edit script docs in-platform", "Sync doc → script field"],
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    surfaces: ["Script Writer studio", "Task attachments"],
  },
  {
    id: "google_sheets",
    label: "Google Sheets",
    category: "docs",
    icon: "Sheet",
    auth: "oauth",
    capabilities: ["Execution plans", "Bulk content matrices", "Import rows → tasks"],
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    surfaces: ["Strategist studio", "Pipeline"],
  },
  {
    id: "google_drive",
    label: "Google Drive",
    category: "docs",
    icon: "HardDrive",
    auth: "oauth",
    capabilities: ["Asset library", "Attach files to tasks/pipeline"],
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    surfaces: ["Creator studio", "Tasks"],
  },
  {
    id: "tiktok",
    label: "TikTok",
    category: "social",
    icon: "Music2",
    auth: "browser",
    capabilities: ["Lightpanda login + scrape viral/trending/engagement", "Trend scraping", "Post performance"],
    envVars: ["LIGHTPANDA_CDP_URL"],
    surfaces: ["Account Monitor", "Reports", "Trends"],
  },
  {
    id: "instagram",
    label: "Instagram",
    category: "social",
    icon: "Instagram",
    auth: "browser",
    capabilities: ["Lightpanda login + scrape viral/trending/engagement", "Explore + hashtag reels", "Post insights"],
    envVars: ["LIGHTPANDA_CDP_URL"],
    surfaces: ["Account Monitor", "Reports", "Trends"],
  },
  {
    id: "youtube",
    label: "YouTube",
    category: "social",
    icon: "Youtube",
    auth: "api_key",
    capabilities: ["Trending (most popular) for strategists", "Video stats", "Trend research"],
    envVars: ["YOUTUBE_API_KEY"],
    surfaces: ["Trends", "Strategist studio", "Reports"],
  },
  {
    id: "social_growth_engineer",
    label: "Social Growth Engineer",
    category: "growth",
    icon: "TrendingUp",
    auth: "api_key",
    capabilities: ["Warmup automation", "Growth ops", "Account actions"],
    envVars: ["SGE_API_URL", "SGE_API_KEY"],
    surfaces: ["Account Monitor"],
  },
  {
    id: "postiz",
    label: "Postiz",
    category: "publishing",
    icon: "Send",
    auth: "api_key",
    capabilities: ["Schedule + publish to accounts", "Cross-post"],
    envVars: ["POSTIZ_API_URL", "POSTIZ_API_KEY"],
    surfaces: ["Pipeline", "Account Monitor"],
  },
  {
    id: "github",
    label: "GitHub",
    category: "dev",
    icon: "Github",
    auth: "api_key",
    capabilities: ["Issues → dev tasks", "PR/commit progress", "CI status"],
    envVars: ["GITHUB_TOKEN", "GITHUB_REPO"],
    surfaces: ["Dev board", "Lead Command Center"],
  },
  {
    id: "analytics",
    label: "Google Analytics",
    category: "analytics",
    icon: "BarChart3",
    auth: "oauth",
    capabilities: ["Traffic + conversion", "Campaign attribution"],
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    surfaces: ["Reports", "Lead Command Center"],
  },
];

export function getProvider(id: ProviderId): ProviderMeta | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** True when every required env var for a provider is present. */
export function providerConfigured(p: ProviderMeta): boolean {
  return p.envVars.every((v) => !!process.env[v]);
}

// ---- Connector contract (backend) ----
export interface SyncResult {
  provider: ProviderId;
  ok: boolean;
  itemsSynced: number;
  note?: string;
  error?: string;
}

export interface IntegrationConnector {
  provider: ProviderId;
  isConfigured(): boolean;
  /** Pull fresh data from the external tool into the CIH. */
  sync(): Promise<SyncResult>;
}
