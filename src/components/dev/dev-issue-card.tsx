"use client";

import { Github, UserRound } from "lucide-react";
import Avatar from "@/components/avatar";
import type { DevIssue, TeamMember } from "@/lib/types";
import {
  DEV_ISSUE_STATUSES,
  type DevIssueStatus,
  type DevSeverity,
  type DevArea,
} from "@/lib/constants";
import { relativeTime, cn } from "@/lib/utils";

interface DevIssueCardProps {
  issue: DevIssue;
  team: TeamMember[];
  onStatusChange: (status: DevIssueStatus) => void;
  onAssigneeChange: (assigneeId: string | null) => void;
}

const SEVERITY_TONE: Record<DevSeverity, string> = {
  critical: "border-danger/40 bg-danger/10 text-danger",
  high: "border-warning/40 bg-warning/10 text-warning",
  medium: "border-primary/40 bg-primary/10 text-primary",
  low: "border-border bg-surface-2/60 text-muted",
};

const AREA_LABEL: Record<DevArea, string> = {
  frontend: "Frontend",
  backend: "Backend",
  agent: "Agent",
  infra: "Infra",
  data: "Data",
  general: "General",
};

const STATUS_LABEL: Record<DevIssueStatus, string> = {
  open: "Open",
  triaging: "Triaging",
  in_progress: "In Progress",
  blocked: "Blocked",
  resolved: "Resolved",
  closed: "Closed",
};

/** Single issue card: severity + area chips, reporter, assignee selector, status selector, github link. */
export default function DevIssueCard({ issue, team, onStatusChange, onAssigneeChange }: DevIssueCardProps) {
  return (
    <article className="glass glass-hover flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold leading-snug text-fg">{issue.title}</h3>
        {issue.github_url && (
          <a
            href={issue.github_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`GitHub issue${issue.github_issue_number ? ` #${issue.github_issue_number}` : ""}`}
            className="grid size-7 shrink-0 place-items-center rounded-lg text-muted outline-none transition-colors hover:bg-surface-2/70 hover:text-fg focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <Github className="size-4" aria-hidden />
          </a>
        )}
      </div>

      {issue.description && (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted">{issue.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("chip capitalize", SEVERITY_TONE[issue.severity])}>{issue.severity}</span>
        <span className="chip border-border bg-surface-2/60 text-muted">{AREA_LABEL[issue.area]}</span>
        {issue.github_issue_number != null && (
          <span className="tnum chip border-border bg-surface-2/60 text-muted">
            #{issue.github_issue_number}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
          <UserRound className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {issue.reporter?.name ? `by ${issue.reporter.name}` : "anonymous"}
          </span>
          <span aria-hidden>·</span>
          <span className="tnum whitespace-nowrap">{relativeTime(issue.created_at)}</span>
        </span>
        <Avatar name={issue.assignee?.name} size={24} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="sr-only">Status</span>
          <select
            value={issue.status}
            onChange={(e) => onStatusChange(e.target.value as DevIssueStatus)}
            aria-label={`Status for ${issue.title}`}
            className="min-h-[40px] cursor-pointer appearance-none rounded-lg border border-border bg-surface-2/50 px-2.5 py-1.5 text-xs font-medium text-fg outline-none transition-colors hover:border-white/20 focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            {DEV_ISSUE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="sr-only">Assignee</span>
          <select
            value={issue.assignee_id ?? ""}
            onChange={(e) => onAssigneeChange(e.target.value || null)}
            aria-label={`Assignee for ${issue.title}`}
            className="min-h-[40px] cursor-pointer appearance-none rounded-lg border border-border bg-surface-2/50 px-2.5 py-1.5 text-xs font-medium text-fg outline-none transition-colors hover:border-white/20 focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <option value="">Unassigned</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </article>
  );
}
