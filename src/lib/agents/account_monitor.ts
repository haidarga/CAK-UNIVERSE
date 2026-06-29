// ============================================================
// AccountMonitorAgent — daily warmup health scan.
//
// Phase upgrades + anomaly detection are DETERMINISTIC (warmup.ts).
// The LLM is used ONLY to narrate anomalies into human-readable
// `action_required` text and to set `alert_priority`. It NEVER
// decides phase upgrades.
// ============================================================
import { BaseAgent } from "@/lib/agents/base";
import { admin, nowIso } from "@/lib/supabase";
import {
  evaluateGraduation,
  detectAnomalies,
  postLimitFor,
  type AccountSnapshot,
  type MetricsWindow,
} from "@/lib/warmup";
import { sendTelegramAlert } from "@/lib/integrations/telegram";
import type { Account, AnomalyAnalysis, KpiMetric } from "@/lib/types";
import type { WarmupPhase, AlertPriority } from "@/lib/constants";
import { ALERT_PRIORITY } from "@/lib/constants";

export const ACCOUNT_MONITOR_SYSTEM = `You are the Account Monitor narrator for a social-media warmup system.

You are given an account's CURRENT warmup phase and a list of DETERMINISTIC anomaly flags that were already computed in code. Your ONLY job is to:
1. Write a concise, human-readable "action_required" instruction for the operator.
2. Assign an "alert_priority" from: low, medium, high, critical.

CRITICAL RULES:
- DO NOT decide or suggest phase upgrades/downgrades. Phase changes are handled deterministically in code; ignore them.
- Base priority strictly on the supplied anomaly flags:
  - shadow_ban_risk => critical
  - engagement_drop => high
  - posting_gap => medium
  - warmup_stalled => medium
  - no flags => low (action_required should say "No action needed.")
  - multiple high-severity flags => escalate to critical
- Keep action_required under 240 characters, imperative voice.

Respond with ONLY this JSON shape:
{ "action_required": string, "alert_priority": "low"|"medium"|"high"|"critical" }`;

interface NarrationResult {
  action_required: string;
  alert_priority: AlertPriority;
}

export class AccountMonitorAgent extends BaseAgent {
  constructor() {
    super("account_monitor");
  }

  /** Run a full warmup health scan for every active account in a brand. */
  async runDailyScan(brandId: string): Promise<AnomalyAnalysis[]> {
    const accounts = (await this.getAccounts(brandId)) as Account[];
    const results: AnomalyAnalysis[] = [];

    for (const account of accounts) {
      const analysis = await this.scanAccount(brandId, account);
      results.push(analysis);
    }

    return results;
  }

  private async scanAccount(brandId: string, account: Account): Promise<AnomalyAnalysis> {
    const metrics = await this.getMetricsWindow(account.id);

    const snapshot: AccountSnapshot = {
      warmup_phase: account.warmup_phase,
      phase_changed_at: account.phase_changed_at,
      follower_count: account.follower_count,
      engagement_rate: account.engagement_rate,
      avg_views_last_7d: account.avg_views_last_7d,
      last_posted_at: account.last_posted_at,
      status: account.status,
    };

    // Deterministic decisions.
    const graduation = evaluateGraduation(snapshot, metrics);
    const anomalies = detectAnomalies(snapshot, metrics);

    // Apply deterministic phase upgrade.
    if (graduation.shouldUpgrade) {
      await this.upgradePhase(account.id, graduation.recommendedPhase);
    }

    // LLM narration of anomalies only.
    const narration = await this.narrateAnomalies(brandId, account, anomalies);

    // Persist anomaly flags + alert on high/critical.
    if (anomalies.length > 0) {
      await admin()
        .from("accounts")
        .update({
          anomaly_flags: anomalies,
          anomaly_flagged_at: nowIso(),
        })
        .eq("id", account.id);

      if (narration.alert_priority === "high" || narration.alert_priority === "critical") {
        await sendTelegramAlert(
          `*Account alert* (${narration.alert_priority.toUpperCase()})\n` +
            `@${account.username} [${account.platform}]\n` +
            `Flags: ${anomalies.join(", ")}\n` +
            `${narration.action_required}`,
        );
      }
    }

    const newPhase: WarmupPhase = graduation.shouldUpgrade
      ? graduation.recommendedPhase
      : account.warmup_phase;

    return {
      account_id: account.id,
      current_phase: account.warmup_phase,
      recommended_phase: graduation.recommendedPhase,
      should_upgrade: graduation.shouldUpgrade,
      anomalies,
      daily_post_limit: postLimitFor(newPhase),
      action_required: narration.action_required,
      alert_priority: narration.alert_priority,
    };
  }

  /**
   * Aggregate ~14 days of kpi_metrics into a MetricsWindow.
   * `avgEngagementRate` = the 3 most recent days; `baselineEngagementRate` =
   * the days before that — so a genuine recent drop is detectable, instead of
   * comparing a window against itself.
   */
  private async getMetricsWindow(accountId: string): Promise<MetricsWindow> {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);

    const { data } = await admin()
      .from("kpi_metrics")
      .select("*")
      .eq("account_id", accountId)
      .gte("date", since)
      .order("date", { ascending: true });

    const rows = (data ?? []) as KpiMetric[];

    if (rows.length === 0) {
      return { followersGained: 0, avgEngagementRate: 0, recentViews: [], baselineEngagementRate: 0 };
    }

    const followersGained = rows.reduce((sum, r) => sum + (r.followers_gained ?? 0), 0);
    const recentViews = rows.map((r) => r.total_views ?? 0); // oldest -> newest

    const avg = (rs: KpiMetric[]): number => {
      const v = rs.map((r) => r.engagement_rate).filter((x): x is number => typeof x === "number");
      return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : 0;
    };

    // Last 3 days vs the prior days. If too few rows, baseline falls back to the
    // full-window average (then drop computes to ~0, i.e. no false positive).
    const recent = rows.slice(-3);
    const prior = rows.length > 3 ? rows.slice(0, -3) : rows;

    return {
      followersGained,
      avgEngagementRate: avg(recent),
      recentViews,
      baselineEngagementRate: avg(prior),
    };
  }

  /** Deterministic phase upgrade write. */
  private async upgradePhase(accountId: string, newPhase: WarmupPhase): Promise<void> {
    await admin()
      .from("accounts")
      .update({
        warmup_phase: newPhase,
        phase_changed_at: nowIso(),
        daily_post_limit: postLimitFor(newPhase),
      })
      .eq("id", accountId);
  }

  /** LLM narrates the deterministic flags into operator text + priority. */
  private async narrateAnomalies(
    brandId: string,
    account: Account,
    anomalies: string[],
  ): Promise<NarrationResult> {
    const prompt = `Account: @${account.username} (${account.platform})
Current warmup phase: ${account.warmup_phase}
Deterministic anomaly flags: ${anomalies.length > 0 ? anomalies.join(", ") : "none"}

Produce the action_required text and alert_priority JSON.`;

    const result = await this.run<NarrationResult>({
      system: ACCOUNT_MONITOR_SYSTEM,
      prompt,
      json: true,
      temperature: 0.3,
      maxTokens: 400,
      brandId,
      accountId: account.id,
      runType: "scheduled",
    });

    if (result.success && result.data) {
      const priority = ALERT_PRIORITY.includes(result.data.alert_priority)
        ? result.data.alert_priority
        : this.fallbackPriority(anomalies);
      return {
        action_required: result.data.action_required || this.fallbackAction(anomalies),
        alert_priority: priority,
      };
    }

    // LLM failed — fall back to a deterministic default so the scan still completes.
    return {
      action_required: this.fallbackAction(anomalies),
      alert_priority: this.fallbackPriority(anomalies),
    };
  }

  private fallbackPriority(anomalies: string[]): AlertPriority {
    if (anomalies.includes("shadow_ban_risk")) return "critical";
    if (anomalies.includes("engagement_drop")) return "high";
    if (anomalies.length > 0) return "medium";
    return "low";
  }

  private fallbackAction(anomalies: string[]): string {
    if (anomalies.length === 0) return "No action needed.";
    return `Review account: ${anomalies.join(", ")}.`;
  }
}
