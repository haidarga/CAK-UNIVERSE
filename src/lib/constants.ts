// ============================================================
// Domain constants — single source for warmup rules & phases.
// Phase upgrade logic is DETERMINISTIC and lives here (not in an LLM).
// The LLM is only used for fuzzy anomaly judgement.
// ============================================================

export const WARMUP_PHASES = ["cold", "warming", "warm", "active", "paused"] as const;
export type WarmupPhase = (typeof WARMUP_PHASES)[number];

export const PIPELINE_STAGES = [
  "briefed",
  "direction_set",
  "scripted",
  "script_reviewed",
  "guardrail_review",
  "produced",
  "qc_review",
  "qc_passed",
  "qc_failed",
  "scheduled",
  "posted",
  "archived",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

// Daily post limit per phase
export const PHASE_POST_LIMITS: Record<WarmupPhase, number> = {
  cold: 1,
  warming: 2,
  warm: 3,
  active: 5,
  paused: 0,
};

// Deterministic graduation thresholds. Each phase points to the next.
export const PHASE_GRADUATION: Record<
  string,
  {
    next: WarmupPhase;
    minDays: number;
    minFollowerGrowthPerDay?: number;
    minFollowers?: number;
    minEngagementRate: number;
  }
> = {
  cold: { next: "warming", minDays: 7, minFollowerGrowthPerDay: 10, minEngagementRate: 0.03 },
  warming: { next: "warm", minDays: 14, minFollowers: 200, minEngagementRate: 0.04 },
  warm: { next: "active", minDays: 30, minFollowers: 500, minEngagementRate: 0.05 },
};

export const PHASE_BADGE: Record<
  string,
  { label: string; dot: string; text: string; ring: string }
> = {
  cold: { label: "Cold", dot: "bg-phase-cold", text: "text-phase-cold", ring: "border-phase-cold/40" },
  warming: { label: "Warming", dot: "bg-phase-warming", text: "text-phase-warming", ring: "border-phase-warming/40" },
  warm: { label: "Warm", dot: "bg-phase-warm", text: "text-phase-warm", ring: "border-phase-warm/40" },
  active: { label: "Active", dot: "bg-phase-active", text: "text-phase-active", ring: "border-phase-active/40" },
  paused: { label: "Paused", dot: "bg-phase-paused", text: "text-phase-paused", ring: "border-phase-paused/40" },
  flagged: { label: "Flagged", dot: "bg-phase-flagged", text: "text-phase-flagged", ring: "border-phase-flagged/40" },
};

export const ALERT_PRIORITY = ["low", "medium", "high", "critical"] as const;
export type AlertPriority = (typeof ALERT_PRIORITY)[number];

export const CLAUDE_MODEL = "claude-sonnet-4-6";

// ============================================================
// Work OS — tasks, roles, dev issues (migration 002)
// ============================================================

export const TEAM_ROLES = [
  "lead",
  "strategist",
  "script_writer",
  "creator",
  "head_of_creator",
  "account_monitor",
  "developer",
  "admin",
] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const ROLE_LABEL: Record<TeamRole, string> = {
  lead: "Lead",
  strategist: "Strategist",
  script_writer: "Script Writer",
  creator: "Creator",
  head_of_creator: "Head of Creator",
  account_monitor: "Account Monitor",
  developer: "Developer",
  admin: "Admin",
};

export const TASK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "blocked",
  "review",
  "done",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// Statuses that count as "active work in flight".
export const ACTIVE_TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked", "review"];

export const TASK_TYPES = [
  "content",
  "strategy",
  "script",
  "production",
  "qc",
  "account",
  "dev",
  "general",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_PRIORITY: Record<number, { label: string; tone: string }> = {
  1: { label: "Urgent", tone: "text-danger" },
  2: { label: "High", tone: "text-warning" },
  3: { label: "Normal", tone: "text-muted" },
  4: { label: "Low", tone: "text-muted" },
};

export const TASK_STATUS_BADGE: Record<TaskStatus, { label: string; dot: string; text: string }> = {
  backlog: { label: "Backlog", dot: "bg-phase-cold", text: "text-phase-cold" },
  todo: { label: "To Do", dot: "bg-primary", text: "text-primary" },
  in_progress: { label: "In Progress", dot: "bg-phase-warming", text: "text-phase-warming" },
  blocked: { label: "Blocked", dot: "bg-phase-flagged", text: "text-phase-flagged" },
  review: { label: "Review", dot: "bg-phase-active", text: "text-phase-active" },
  done: { label: "Done", dot: "bg-phase-warm", text: "text-phase-warm" },
  cancelled: { label: "Cancelled", dot: "bg-muted", text: "text-muted" },
};

export const DEV_ISSUE_STATUSES = [
  "open",
  "triaging",
  "in_progress",
  "blocked",
  "resolved",
  "closed",
] as const;
export type DevIssueStatus = (typeof DEV_ISSUE_STATUSES)[number];

export const DEV_SEVERITY = ["low", "medium", "high", "critical"] as const;
export type DevSeverity = (typeof DEV_SEVERITY)[number];

export const DEV_AREAS = ["frontend", "backend", "agent", "infra", "data", "general"] as const;
export type DevArea = (typeof DEV_AREAS)[number];
