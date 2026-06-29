"use client";

import { useMemo, useState } from "react";
import { Plus, Sparkles, X } from "lucide-react";
import type { Task, TeamMember, Brand } from "@/lib/types";
import {
  TASK_STATUSES,
  TASK_STATUS_BADGE,
  TASK_TYPES,
  TASK_PRIORITY,
} from "@/lib/constants";
import type { TaskStatus, TaskType } from "@/lib/constants";
import { cn } from "@/lib/utils";
import KanbanColumn from "@/components/kanban-column";
import TaskCard from "@/components/task-card";
import TaskDrawer from "@/components/task-drawer";

interface TasksBoardProps {
  initialTasks: Task[];
  members: TeamMember[];
  brands: Pick<Brand, "id" | "name">[];
}

// Board lanes (cancelled is hidden from the board).
const COLUMNS: TaskStatus[] = ["backlog", "todo", "in_progress", "blocked", "review", "done"];

async function envelope<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { success: boolean; data: T; error: string | null };
  if (!json.success) throw new Error(json.error ?? "Request failed");
  return json.data;
}

const selectCls =
  "min-h-[40px] rounded-xl border border-border bg-surface-2/50 px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/60";

export default function TasksBoard({ initialTasks, members, brands }: TasksBoardProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [assignee, setAssignee] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [active, setActive] = useState<Task | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (assignee === "all" ||
            (assignee === "unassigned" ? !t.assignee_id : t.assignee_id === assignee)) &&
          (typeFilter === "all" || t.type === typeFilter) &&
          (statusFilter === "all" || t.status === statusFilter),
      ),
    [tasks, assignee, typeFilter, statusFilter],
  );

  const byStatus = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const t of filtered) map.set(t.status, [...(map.get(t.status) ?? []), t]);
    return map;
  }, [filtered]);

  async function refresh() {
    try {
      setTasks(await fetch("/api/tasks").then(envelope<Task[]>));
    } catch {
      /* keep current state if refresh fails */
    }
  }

  function upsert(updated: Task) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
    setActive((cur) => (cur && cur.id === updated.id ? { ...cur, ...updated } : cur));
  }

  async function aiBreakdown() {
    const goal = window.prompt("Describe the goal — AI will break it into tasks:");
    if (!goal?.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/tasks/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goal.trim() }),
      }).then(envelope<Task[]>);
      await refresh();
    } catch {
      window.alert("AI breakdown failed. Check that the API and model key are configured.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <select
          aria-label="Filter by assignee"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className={selectCls}
        >
          <option value="all">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className={selectCls}
        >
          <option value="all">All types</option>
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={selectCls}
        >
          <option value="all">All statuses</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_BADGE[s].label}
            </option>
          ))}
        </select>

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={aiBreakdown}
            disabled={busy}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/15 px-3.5 text-sm font-medium text-accent outline-none transition-colors hover:bg-accent/25 focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50"
          >
            <Sparkles className="size-4" aria-hidden />
            AI Breakdown
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/15 px-3.5 text-sm font-medium text-primary outline-none transition-colors hover:bg-primary/25 focus-visible:ring-2 focus-visible:ring-primary/60"
            aria-expanded={showForm}
          >
            {showForm ? <X className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
            New Task
          </button>
        </div>
      </div>

      {showForm && (
        <NewTaskForm
          members={members}
          brands={brands}
          onCancel={() => setShowForm(false)}
          onCreated={(t) => {
            setTasks((prev) => [t, ...prev]);
            setShowForm(false);
          }}
        />
      )}

      {/* Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((status) => {
          const cards = byStatus.get(status) ?? [];
          return (
            <KanbanColumn
              key={status}
              title={TASK_STATUS_BADGE[status].label}
              count={cards.length}
              dot={TASK_STATUS_BADGE[status].dot}
            >
              {cards.map((t) => (
                <TaskCard key={t.id} task={t} onClick={setActive} />
              ))}
            </KanbanColumn>
          );
        })}
      </div>

      <TaskDrawer
        task={active}
        members={members}
        onClose={() => setActive(null)}
        onUpdated={upsert}
      />
    </>
  );
}

function NewTaskForm({
  members,
  brands,
  onCreated,
  onCancel,
}: {
  members: TeamMember[];
  brands: Pick<Brand, "id" | "name">[];
  onCreated: (t: Task) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("general");
  const [priority, setPriority] = useState(3);
  const [assigneeId, setAssigneeId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const created = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          type,
          priority,
          assignee_id: assigneeId || null,
          brand_id: brandId || null,
        }),
      }).then(envelope<Task>);
      onCreated(created);
    } catch {
      window.alert("Could not create task. Check the API and database connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass mb-5 flex flex-col gap-3 p-4 animate-fade-up">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title…"
        aria-label="Task title"
        className="min-h-[44px] w-full rounded-xl border border-border bg-surface-2/50 px-3.5 text-sm text-fg outline-none placeholder:text-muted/60 focus-visible:ring-2 focus-visible:ring-primary/60"
      />
      <div className="flex flex-wrap gap-2">
        <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value as TaskType)} className={selectCls}>
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select aria-label="Priority" value={priority} onChange={(e) => setPriority(Number(e.target.value))} className={selectCls}>
          {Object.entries(TASK_PRIORITY).map(([v, p]) => (
            <option key={v} value={v}>
              {p.label}
            </option>
          ))}
        </select>
        <select aria-label="Assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={selectCls}>
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select aria-label="Brand" value={brandId} onChange={(e) => setBrandId(e.target.value)} className={selectCls}>
          <option value="">No brand</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[40px] rounded-xl border border-border px-4 text-sm text-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className={cn(
            "min-h-[40px] rounded-xl border border-primary/40 bg-primary/15 px-4 text-sm font-medium text-primary outline-none transition-colors hover:bg-primary/25 focus-visible:ring-2 focus-visible:ring-primary/60",
            "disabled:opacity-50",
          )}
        >
          {saving ? "Creating…" : "Create Task"}
        </button>
      </div>
    </form>
  );
}
