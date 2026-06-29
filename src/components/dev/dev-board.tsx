"use client";

import { useMemo, useState } from "react";
import type { DevIssue, TeamMember } from "@/lib/types";
import { DEV_ISSUE_STATUSES, type DevIssueStatus } from "@/lib/constants";
import DevIssueCard from "@/components/dev/dev-issue-card";

interface DevBoardProps {
  initialIssues: DevIssue[];
  team: TeamMember[];
}

const COLUMN_LABEL: Record<DevIssueStatus, string> = {
  open: "Open",
  triaging: "Triaging",
  in_progress: "In Progress",
  blocked: "Blocked",
  resolved: "Resolved",
  closed: "Closed",
};

/** Kanban board grouped by dev status. Cards can change status + assignee (PATCH). */
export default function DevBoard({ initialIssues, team }: DevBoardProps) {
  const [issues, setIssues] = useState<DevIssue[]>(initialIssues);

  const teamById = useMemo(() => new Map(team.map((m) => [m.id, m])), [team]);

  const byStatus = useMemo(() => {
    const map = new Map<DevIssueStatus, DevIssue[]>();
    for (const s of DEV_ISSUE_STATUSES) map.set(s, []);
    for (const issue of issues) {
      const bucket = map.get(issue.status) ?? map.get("open")!;
      bucket.push(issue);
    }
    return map;
  }, [issues]);

  /** Optimistic local patch; rolls back on failure. */
  async function patchIssue(id: string, patch: { status?: DevIssueStatus; assignee_id?: string | null }) {
    const prev = issues;
    setIssues((cur) =>
      cur.map((i) => {
        if (i.id !== id) return i;
        const nextAssignee =
          patch.assignee_id !== undefined ? (patch.assignee_id ? teamById.get(patch.assignee_id) ?? null : null) : i.assignee;
        return {
          ...i,
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.assignee_id !== undefined ? { assignee_id: patch.assignee_id, assignee: nextAssignee } : {}),
        };
      }),
    );
    try {
      const res = await fetch(`/api/dev-issues/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as { success: boolean; error: string | null };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Update failed");
    } catch {
      setIssues(prev); // rollback
    }
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {DEV_ISSUE_STATUSES.map((status) => {
        const cards = byStatus.get(status) ?? [];
        return (
          <section key={status} className="flex w-80 shrink-0 flex-col" aria-label={COLUMN_LABEL[status]}>
            <div className="glass mb-3 flex items-center justify-between rounded-xl px-3.5 py-2.5">
              <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted">
                {COLUMN_LABEL[status]}
              </span>
              <span className="tnum chip border-border bg-surface-2/60 text-muted">{cards.length}</span>
            </div>
            <div className="flex flex-col gap-3">
              {cards.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted">
                  Empty
                </p>
              ) : (
                cards.map((issue) => (
                  <DevIssueCard
                    key={issue.id}
                    issue={issue}
                    team={team}
                    onStatusChange={(s) => patchIssue(issue.id, { status: s })}
                    onAssigneeChange={(a) => patchIssue(issue.id, { assignee_id: a })}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
