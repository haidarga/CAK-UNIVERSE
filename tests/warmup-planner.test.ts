import { describe, test, expect } from "vitest";
import { planWarmupSession, isWarmupDue, type Rand } from "@/lib/warmup/planner";

// Deterministic seeded RNG (mulberry32) for reproducible plans.
function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("planWarmupSession", () => {
  test("is deterministic for a fixed seed", () => {
    const a = planWarmupSession("warm", seeded(42));
    const b = planWarmupSession("warm", seeded(42));
    expect(a).toEqual(b);
  });

  test("cold phase never comments or follows", () => {
    for (let s = 1; s <= 20; s++) {
      const plan = planWarmupSession("cold", seeded(s));
      expect(plan.comments).toBe(0);
      expect(plan.follows).toBe(0);
    }
  });

  test("active phase is more aggressive than cold (more videos + likes)", () => {
    const cold = planWarmupSession("cold", seeded(7));
    const active = planWarmupSession("active", seeded(7));
    expect(active.videos).toBeGreaterThan(cold.videos);
    expect(active.likes).toBeGreaterThanOrEqual(cold.likes);
  });

  test("paused phase yields an empty session", () => {
    const plan = planWarmupSession("paused", seeded(3));
    expect(plan.videos).toBe(0);
    expect(plan.actions).toEqual([]);
  });

  test("every video has a scroll + watch; delays are human (non-zero scrolls)", () => {
    const plan = planWarmupSession("warm", seeded(99));
    const watches = plan.actions.filter((a) => a.type === "watch");
    expect(watches.length).toBe(plan.videos);
    for (const w of watches) expect(w.watchMs).toBeGreaterThan(0);
    // scroll gaps should be realistic (>= ~0.8s), never instant
    const scrolls = plan.actions.filter((a) => a.type === "scroll" && a.step >= 0);
    for (const s of scrolls) expect(s.delayMs).toBeGreaterThanOrEqual(800);
  });

  test("comment actions are flagged needsComment", () => {
    const plan = planWarmupSession("active", seeded(5));
    const commentActions = plan.actions.filter((a) => a.type === "comment");
    expect(commentActions.length).toBe(plan.comments);
    for (const c of commentActions) expect(c.needsComment).toBe(true);
  });
});

describe("planWarmupSession targetMinutes", () => {
  test("longer target produces more videos", () => {
    const short = planWarmupSession("warm", seeded(11), 5);
    const long = planWarmupSession("warm", seeded(11), 30);
    expect(long.videos).toBeGreaterThan(short.videos);
  });

  test("estimated duration scales roughly toward the target", () => {
    const plan = planWarmupSession("warm", seeded(11), 20);
    const minutes = plan.estimatedDurationMs / 60_000;
    // loose bounds — jitter + idle pause make it approximate
    expect(minutes).toBeGreaterThan(8);
    expect(minutes).toBeLessThan(40);
  });

  test("paused stays empty even with a target", () => {
    expect(planWarmupSession("paused", seeded(1), 30).videos).toBe(0);
  });
});

describe("isWarmupDue", () => {
  const NOW = new Date("2026-06-28T12:00:00Z").getTime();
  const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

  test("never run when paused", () => {
    expect(isWarmupDue({ warmup_phase: "paused", last_warmup_at: null }, NOW)).toBe(false);
  });
  test("due when never warmed", () => {
    expect(isWarmupDue({ warmup_phase: "cold", last_warmup_at: null }, NOW)).toBe(true);
  });
  test("not due right after a run", () => {
    expect(isWarmupDue({ warmup_phase: "warm", last_warmup_at: hoursAgo(1), min_hours_between_posts: 24 }, NOW)).toBe(false);
  });
  test("due once enough time passed", () => {
    expect(isWarmupDue({ warmup_phase: "warm", last_warmup_at: hoursAgo(20), min_hours_between_posts: 24 }, NOW)).toBe(true);
  });
});
