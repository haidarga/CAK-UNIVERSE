import { describe, test, expect } from "vitest";
import {
  evaluateGraduation,
  detectAnomalies,
  daysInPhase,
  postLimitFor,
  type AccountSnapshot,
  type MetricsWindow,
} from "@/lib/warmup";

const NOW = new Date("2026-06-28T00:00:00Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function account(over: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    warmup_phase: "cold",
    phase_changed_at: daysAgo(10),
    follower_count: 50,
    engagement_rate: 0.04,
    avg_views_last_7d: 1000,
    last_posted_at: daysAgo(1),
    status: "active",
    ...over,
  };
}

function metrics(over: Partial<MetricsWindow> = {}): MetricsWindow {
  return {
    followersGained: 120,
    avgEngagementRate: 0.04,
    recentViews: [1000, 1100, 1050, 1080],
    baselineEngagementRate: 0.04,
    ...over,
  };
}

describe("daysInPhase", () => {
  test("computes whole days since phase change", () => {
    expect(daysInPhase(account({ phase_changed_at: daysAgo(7) }), NOW)).toBe(7);
  });

  test("returns 0 when phase never changed", () => {
    expect(daysInPhase(account({ phase_changed_at: null }), NOW)).toBe(0);
  });
});

describe("evaluateGraduation", () => {
  test("cold -> warming when all thresholds met", () => {
    const r = evaluateGraduation(
      account({ warmup_phase: "cold", phase_changed_at: daysAgo(8) }),
      metrics({ followersGained: 120, avgEngagementRate: 0.04 }), // 15/day, eng 4%
      NOW,
    );
    expect(r.shouldUpgrade).toBe(true);
    expect(r.recommendedPhase).toBe("warming");
  });

  test("cold stays cold when too young", () => {
    const r = evaluateGraduation(
      account({ warmup_phase: "cold", phase_changed_at: daysAgo(3) }),
      metrics(),
      NOW,
    );
    expect(r.shouldUpgrade).toBe(false);
    expect(r.recommendedPhase).toBe("cold");
  });

  test("cold stays cold when engagement below threshold", () => {
    const r = evaluateGraduation(
      account({ warmup_phase: "cold", phase_changed_at: daysAgo(10) }),
      metrics({ avgEngagementRate: 0.02 }),
      NOW,
    );
    expect(r.shouldUpgrade).toBe(false);
  });

  test("warming -> warm requires follower count, not growth rate", () => {
    const r = evaluateGraduation(
      account({ warmup_phase: "warming", phase_changed_at: daysAgo(15), follower_count: 250 }),
      metrics({ avgEngagementRate: 0.05 }),
      NOW,
    );
    expect(r.shouldUpgrade).toBe(true);
    expect(r.recommendedPhase).toBe("warm");
  });

  test("active never auto-upgrades (terminal)", () => {
    const r = evaluateGraduation(account({ warmup_phase: "active" }), metrics(), NOW);
    expect(r.shouldUpgrade).toBe(false);
    expect(r.recommendedPhase).toBe("active");
  });
});

describe("detectAnomalies", () => {
  test("flags engagement_drop when >40% below baseline", () => {
    const flags = detectAnomalies(
      account(),
      metrics({ avgEngagementRate: 0.02, baselineEngagementRate: 0.05 }),
      NOW,
    );
    expect(flags).toContain("engagement_drop");
  });

  test("flags shadow_ban_risk when recent views collapse >70%", () => {
    const flags = detectAnomalies(
      account(),
      metrics({ recentViews: [5000, 1200, 1000, 900] }),
      NOW,
    );
    expect(flags).toContain("shadow_ban_risk");
  });

  test("flags warmup_stalled when stuck >2x expected", () => {
    const flags = detectAnomalies(
      account({ warmup_phase: "cold", phase_changed_at: daysAgo(20) }),
      metrics(),
      NOW,
    );
    expect(flags).toContain("warmup_stalled");
  });

  test("flags posting_gap for active account silent >48h", () => {
    const flags = detectAnomalies(
      account({ warmup_phase: "active", last_posted_at: daysAgo(3) }),
      metrics(),
      NOW,
    );
    expect(flags).toContain("posting_gap");
  });

  test("healthy account yields no flags", () => {
    expect(detectAnomalies(account(), metrics(), NOW)).toEqual([]);
  });
});

describe("postLimitFor", () => {
  test("maps phases to daily limits", () => {
    expect(postLimitFor("cold")).toBe(1);
    expect(postLimitFor("warming")).toBe(2);
    expect(postLimitFor("warm")).toBe(3);
    expect(postLimitFor("active")).toBe(5);
    expect(postLimitFor("paused")).toBe(0);
  });
});
