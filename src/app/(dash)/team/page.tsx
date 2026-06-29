import {
  Activity,
  AlertTriangle,
  Bug,
  CircleDot,
  Gauge,
  Users,
} from "lucide-react";
import Link from "next/link";
import { admin } from "@/lib/supabase";
import type { Task, TeamMember, ActivityLog, DevIssue, Brand } from "@/lib/types";
import { rollup, memberLoad, bottlenecks, type TaskLike } from "@/lib/progress";
import { ROLE_LABEL } from "@/lib/constants";
import type { TeamRole } from "@/lib/constants";
import PageHeader from "@/components/page-header";
import GlassCard from "@/components/glass-card";
import EmptyState from "@/components/empty-state";
import TaskCard from "@/components/task-card";
import HeroTiles from "@/components/command-center/hero-tiles";
import WorkloadPanel from "@/components/command-center/workload-panel";
import BrandProgressPanel from "@/components/command-center/brand-progress-panel";
import ActivityFeed from "@/components/command-center/activity-feed";

export const dynamic = "force-dynamic";

async function loadAll() {
  try {
    const db = admin();
    const [tasksRes, teamRes, actRes, devRes, brandRes] = await Promise.all([
      db.from("tasks").select("*, assignee:team_members!assignee_id(*), brands(*)"),
      db.from("team_members").select("*").order("name"),
      db.from("activity_log").select("*, actor:team_members(*)").order("created_at", { ascending: false }).limit(40),
      db.from("dev_issues").select("*").not("status", "in", "(resolved,closed)"),
      db.from("brands").select("id, name"),
    ]);
    return {
      tasks: (tasksRes.data ?? []) as Task[],
      team: (teamRes.data ?? []) as TeamMember[],
      activity: (actRes.data ?? []) as ActivityLog[],
      devIssues: (devRes.data ?? []) as DevIssue[],
      brands: (brandRes.data ?? []) as Pick<Brand, "id" | "name">[],
    };
  } catch {
    return {
      tasks: [] as Task[],
      team: [] as TeamMember[],
      activity: [] as ActivityLog[],
      devIssues: [] as DevIssue[],
      brands: [] as Pick<Brand, "id" | "name">[],
    };
  }
}

function toTaskLike(t: Task): TaskLike {
  return {
    id: t.id,
    status: t.status,
    progress: t.progress,
    priority: t.priority,
    due_date: t.due_date,
    assignee_id: t.assignee_id,
    type: t.type,
  };
}

export default async function CommandCenterPage() {
  const { tasks, team, activity, devIssues, brands } = await loadAll();

  if (tasks.length === 0 && team.length === 0) {
    return (
      <>
        <PageHeader title="Command Center" subtitle="Mission control for the whole team" />
        <EmptyState
          icon={Gauge}
          title="Nothing to command yet"
          hint="Once team members and tasks exist, this becomes your mission control. The database may be empty or environment variables are not set."
        />
      </>
    );
  }

  const likes = tasks.map(toTaskLike);
  const roll = rollup(likes);
  const loads = memberLoad(likes);
  const necks = bottlenecks(likes);

  const teamById = new Map(team.map((m) => [m.id, m]));
  const brandById = new Map(brands.map((b) => [b.id, b.name]));

  // Per-member load joined with member identity.
  const memberRows = loads.map((l) => {
    const member = teamById.get(l.assigneeId);
    return {
      id: l.assigneeId,
      name: member?.name ?? "Unknown",
      role: (member?.role ? ROLE_LABEL[member.role as TeamRole] : "—") ?? "—",
      active: l.active,
      overdue: l.overdue,
      urgent: l.urgent,
      done: l.done,
    };
  });
  const maxActive = Math.max(1, ...memberRows.map((r) => r.active));

  // Per-brand rollup.
  const byBrand = aggregateByBrand(tasks, brandById);

  // Bottleneck tasks resolved back to full Task objects (most urgent first).
  const neckTasks = necks
    .map((n) => tasks.find((t) => t.id === n.id))
    .filter((t): t is Task => Boolean(t))
    .slice(0, 6);

  const devBySeverity = countSeverity(devIssues);

  return (
    <>
      <PageHeader
        title="Command Center"
        subtitle="Everything the team is doing — at a glance"
      />

      <HeroTiles roll={roll} />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left + middle: workload, bottlenecks, brands */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <GlassCard title="Team Workload" icon={Users}>
            {memberRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No assigned work yet.</p>
            ) : (
              <WorkloadPanel rows={memberRows} maxActive={maxActive} />
            )}
          </GlassCard>

          <GlassCard title="Bottlenecks" icon={AlertTriangle}>
            {neckTasks.length === 0 ? (
              <p className="flex items-center gap-2 py-6 text-center text-sm text-phase-warm">
                <CircleDot className="size-4" aria-hidden />
                No blocked or overdue tasks. Clear runway.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {neckTasks.map((t) => (
                  <TaskCard key={t.id} task={t} dense />
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard title="Progress by Brand" icon={Gauge}>
            {byBrand.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No brand-tagged tasks yet.</p>
            ) : (
              <BrandProgressPanel rows={byBrand} />
            )}
          </GlassCard>

          <GlassCard
            title="Dev Health"
            icon={Bug}
            action={
              <Link
                href="/dev"
                className="text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                Open dev board →
              </Link>
            }
          >
            <DevHealth open={devIssues.length} bySeverity={devBySeverity} />
          </GlassCard>
        </div>

        {/* Right rail: live activity */}
        <GlassCard title="Live Activity" icon={Activity} className="lg:row-span-2">
          <ActivityFeed
            items={activity.map((a) => ({
              id: a.id,
              actor: a.actor?.name ?? "System",
              action: a.action,
              summary: a.summary,
              createdAt: a.created_at,
            }))}
          />
        </GlassCard>
      </div>
    </>
  );
}

function aggregateByBrand(tasks: Task[], names: Map<string, string>) {
  const map = new Map<string, TaskLike[]>();
  for (const t of tasks) {
    if (!t.brand_id) continue;
    map.set(t.brand_id, [...(map.get(t.brand_id) ?? []), {
      id: t.id,
      status: t.status,
      progress: t.progress,
      priority: t.priority,
      due_date: t.due_date,
      assignee_id: t.assignee_id,
    }]);
  }
  return [...map.entries()]
    .map(([id, list]) => {
      const r = rollup(list);
      return { brand: names.get(id) ?? "Unknown", percent: r.percent, total: r.total, done: r.done };
    })
    .sort((a, b) => b.total - a.total);
}

function countSeverity(issues: DevIssue[]): Record<string, number> {
  const out: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of issues) out[i.severity] = (out[i.severity] ?? 0) + 1;
  return out;
}

function DevHealth({
  open,
  bySeverity,
}: {
  open: number;
  bySeverity: Record<string, number>;
}) {
  const tones: Record<string, string> = {
    critical: "text-danger border-danger/40 bg-danger/10",
    high: "text-phase-warming border-phase-warming/40 bg-phase-warming/10",
    medium: "text-primary border-primary/40 bg-primary/10",
    low: "text-muted border-border bg-surface-2/50",
  };
  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col">
        <span className="tnum text-3xl font-semibold leading-none text-fg">{open}</span>
        <span className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted">
          Open issues
        </span>
      </div>
      <div className="ml-auto flex flex-wrap gap-1.5">
        {(["critical", "high", "medium", "low"] as const).map((s) => (
          <span key={s} className={`chip tnum capitalize ${tones[s]}`}>
            {bySeverity[s] ?? 0} {s}
          </span>
        ))}
      </div>
    </div>
  );
}
