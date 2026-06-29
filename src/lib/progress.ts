// ============================================================
// Pure progress / rollup logic — no DB, no LLM. Unit-tested.
// Powers the Lead Command Center, My Tasks, and campaign rollups.
// ============================================================
import type { TaskStatus, TaskType } from "./constants";

export interface TaskLike {
  id: string;
  status: TaskStatus;
  progress: number;
  priority: number;
  due_date: string | null;
  assignee_id: string | null;
  type?: TaskType;
  completed_at?: string | null;
}

export function isOverdue(task: TaskLike, now = Date.now()): boolean {
  if (!task.due_date) return false;
  if (task.status === "done" || task.status === "cancelled") return false;
  return new Date(task.due_date).getTime() < now;
}

export interface Rollup {
  total: number; // excludes cancelled
  done: number;
  active: number; // todo|in_progress|blocked|review
  blocked: number;
  overdue: number;
  /** % of work complete: done counts 100, others count their progress. */
  percent: number;
  byStatus: Record<TaskStatus, number>;
}

const EMPTY_BY_STATUS = (): Record<TaskStatus, number> => ({
  backlog: 0,
  todo: 0,
  in_progress: 0,
  blocked: 0,
  review: 0,
  done: 0,
  cancelled: 0,
});

export function rollup(tasks: TaskLike[], now = Date.now()): Rollup {
  const byStatus = EMPTY_BY_STATUS();
  for (const t of tasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;

  const counted = tasks.filter((t) => t.status !== "cancelled");
  const total = counted.length;
  const done = byStatus.done;
  const blocked = byStatus.blocked;
  const active = byStatus.todo + byStatus.in_progress + byStatus.blocked + byStatus.review;
  const overdue = tasks.filter((t) => isOverdue(t, now)).length;

  const sumProgress = counted.reduce(
    (sum, t) => sum + (t.status === "done" ? 100 : clamp(t.progress)),
    0,
  );
  const percent = total === 0 ? 0 : Math.round(sumProgress / total);

  return { total, done, active, blocked, overdue, percent, byStatus };
}

export interface MemberLoad {
  assigneeId: string;
  active: number;
  overdue: number;
  done: number;
  urgent: number;
}

/** Per-assignee workload, for the Lead "who is overloaded" view. */
export function memberLoad(tasks: TaskLike[], now = Date.now()): MemberLoad[] {
  const map = new Map<string, MemberLoad>();
  for (const t of tasks) {
    if (!t.assignee_id) continue;
    const m =
      map.get(t.assignee_id) ??
      { assigneeId: t.assignee_id, active: 0, overdue: 0, done: 0, urgent: 0 };
    if (t.status === "done") m.done++;
    else if (t.status !== "cancelled") m.active++;
    if (isOverdue(t, now)) m.overdue++;
    if (t.priority === 1 && t.status !== "done" && t.status !== "cancelled") m.urgent++;
    map.set(t.assignee_id, m);
  }
  return [...map.values()].sort((a, b) => b.active - a.active);
}

/** Bottlenecks worth surfacing to the Lead, most severe first. */
export function bottlenecks(tasks: TaskLike[], now = Date.now()): TaskLike[] {
  return tasks
    .filter((t) => t.status === "blocked" || isOverdue(t, now))
    .sort((a, b) => a.priority - b.priority);
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
