// ============================================================
// Stub connectors for the remaining providers. Each reads its required
// env vars straight from the registry meta (single source of truth) and
// reports a not-yet-wired SyncResult. Replace sync() bodies with real API
// calls as each integration is built out.
//
// NOTE: TikTok + Instagram are NOT here — their primary path is the
// Lightpanda browser scrape (see connectors/lightpanda.ts), wired directly
// in connectors/index.ts. No RapidAPI / Meta API for those two.
// ============================================================
import { getProvider, type IntegrationConnector, type ProviderId, type SyncResult } from "../registry";

/** Generic env-gated stub. isConfigured() reads the provider's envVars. */
class StubConnector implements IntegrationConnector {
  readonly provider: ProviderId;

  constructor(provider: ProviderId) {
    this.provider = provider;
  }

  isConfigured(): boolean {
    const meta = getProvider(this.provider);
    if (!meta) return false;
    return meta.envVars.every((v) => !!process.env[v]);
  }

  async sync(): Promise<SyncResult> {
    return {
      provider: this.provider,
      ok: this.isConfigured(),
      itemsSynced: 0,
      note: `${this.provider} connector stub — wire API here`,
    };
  }
}

export class YouTubeConnector extends StubConnector {
  constructor() {
    super("youtube");
  }
}

export class SocialGrowthEngineerConnector extends StubConnector {
  constructor() {
    super("social_growth_engineer");
  }
}

export class PostizConnector extends StubConnector {
  constructor() {
    super("postiz");
  }
}

export class GoogleDocsConnector extends StubConnector {
  constructor() {
    super("google_docs");
  }
}

export class GoogleSheetsConnector extends StubConnector {
  constructor() {
    super("google_sheets");
  }
}

export class GoogleDriveConnector extends StubConnector {
  constructor() {
    super("google_drive");
  }
}

export class AnalyticsConnector extends StubConnector {
  constructor() {
    super("analytics");
  }
}
