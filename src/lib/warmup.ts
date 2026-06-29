// ============================================================
// Pure warmup logic — deterministic, no DB, no LLM. Fully unit-tested.
// The Account Monitor Agent uses this for phase upgrades; the LLM is
// reserved only for fuzzy, judgement-based anomaly narration.
// ============================================================
import { PHASE_GRADUATION, PHASE_POST_LIMITS, type WarmupPhase } from "./constants";

export interface AccountSnapshot {
  warmup_phase: WarmupPhase;
  phase_changed_at: string | null;
  follower_count: number;
  engagement_rate: number;
  avg_views_last_7d: number;
  last_posted_at: string | null;
  status: string;
}

export interface MetricsWindow {
  /** Net followers gained across the observed window. */
  followersGained: number;
  /** Engagement rate averaged over the window (0..1). */
  avgEngagementRate: number;
  /** Views of the most recent posts, newest last. */
  recentViews: number[];
  /** Baseline engagement rate over the trailing 7 days (0..1). */
  baselineEngagementRate: number;
}

const DAY_MS = 86_400_000;

export function daysInPhase(account: AccountSnapshot, now = Date.now()): number {
  if (!account.phase_changed_at) return 0;
  return Math.floor((now - new Date(account.phase_changed_at).getTime()) / DAY_MS);
}

export interface GraduationResult {
  shouldUpgrade: boolean;
  recommendedPhase: WarmupPhase;
  reason: string;
}

/**
 * Decide whether an account graduates to the next warmup phase.
 * Deterministic: same inputs always yield the same decision.
 */
export function evaluateGraduation(
  account: AccountSnapshot,
  metrics: MetricsWindow,
  now = Date.now(),
): GraduationResult {
  const phase = account.warmup_phase;
  const rule = PHASE_GRADUATION[phase];

  // Terminal phases (active/paused) never auto-upgrade.
  if (!rule) {
    return { shouldUpgrade: false, recommendedPhase: phase, reason: `No graduation from "${phase}"` };
  }

  const days = daysInPhase(account, now);
  const perDayGrowth = days > 0 ? metrics.followersGained / days : metrics.followersGained;

  const checks: { ok: boolean; label: string }[] = [
    { ok: days >= rule.minDays, label: `${days}/${rule.minDays} days` },
    { ok: metrics.avgEngagementRate >= rule.minEngagementRate, label: `eng ${(metrics.avgEngagementRate * 100).toFixed(1)}%/${(rule.minEngagementRate * 100).toFixed(0)}%` },
  ];
  if (rule.minFollowerGrowthPerDay != null) {
    checks.push({ ok: perDayGrowth >= rule.minFollowerGrowthPerDay, label: `growth ${perDayGrowth.toFixed(1)}/${rule.minFollowerGrowthPerDay}/day` });
  }
  if (rule.minFollowers != null) {
    checks.push({ ok: account.follower_count >= rule.minFollowers, label: `followers ${account.follower_count}/${rule.minFollowers}` });
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length === 0) {
    return { shouldUpgrade: true, recommendedPhase: rule.next, reason: `All thresholds met (${checks.map((c) => c.label).join(", ")})` };
  }
  return { shouldUpgrade: false, recommendedPhase: phase, reason: `Not met: ${failed.map((c) => c.label).join(", ")}` };
}

/**
 * Detect deterministic anomalies. (Fuzzy narration is the LLM's job.)
 */
export function detectAnomalies(
  account: AccountSnapshot,
  metrics: MetricsWindow,
  now = Date.now(),
): string[] {
  const flags: string[] = [];

  // engagement_drop: current avg dropped >40% vs 7-day baseline.
  if (metrics.baselineEngagementRate > 0) {
    const drop = 1 - metrics.avgEngagementRate / metrics.baselineEngagementRate;
    if (drop > 0.4) flags.push("engagement_drop");
  }

  // shadow_ban_risk: last 3 posts' views dropped >70% vs the prior view.
  const v = metrics.recentViews;
  if (v.length >= 3) {
    const last3 = v.slice(-3);
    const prior = v[v.length - 4] ?? last3[0];
    const recentAvg = last3.reduce((a, b) => a + b, 0) / 3;
    if (prior > 0 && 1 - recentAvg / prior > 0.7) flags.push("shadow_ban_risk");
  }

  // warmup_stalled: in same phase >2x expected duration.
  const rule = PHASE_GRADUATION[account.warmup_phase];
  if (rule && daysInPhase(account, now) > rule.minDays * 2) flags.push("warmup_stalled");

  // posting_gap: active/warm account silent >48h.
  if (["active", "warm"].includes(account.warmup_phase) && account.last_posted_at) {
    const gapH = (now - new Date(account.last_posted_at).getTime()) / 3_600_000;
    if (gapH > 48) flags.push("posting_gap");
  }

  return flags;
}

export function postLimitFor(phase: WarmupPhase): number {
  return PHASE_POST_LIMITS[phase] ?? 1;
}
