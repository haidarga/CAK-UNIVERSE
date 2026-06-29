import { CalendarClock, Sparkles } from "lucide-react";
import type { Task } from "@/lib/types";
import { TASK_STATUS_BADGE, TASK_PRIORITY } from "@/lib/constants";
import { cn, relativeTime } from "@/lib/utils";
import { isOverdue } from "@/lib/progress";
import Avatar from "@/components/avatar";
import ProgressBar from "@/components/progress-bar";

interface TaskCardProps {
  task: Task;
  onClick?: (task: Task) => void;
  /** Render in tighter spacing for dense lists (e.g. bottlenecks panel). */
  dense?: boolean;
}

/** Compact glass task card: title, type, status, priority, assignee, due, progress. */
export default function TaskCard({ task, onClick, dense = false }: TaskCardProps) {
  const badge = TASK_STATUS_BADGE[task.status];
  const priority = TASK_PRIORITY[task.priority] ?? TASK_PRIORITY[3];
  const overdue = isOverdue({
    id: task.id,
    status: task.status,
    progress: task.progress,
    priority: task.priority,
    due_date: task.due_date,
    assignee_id: task.assignee_id,
  });
  const interactive = Boolean(onClick);

  const Tag = interactive ? "button" : "div";

  return (
    <Tag
      {...(interactive
        ? { type: "button", onClick: () => onClick?.(task), "aria-label": `Open task ${task.title}` }
        : {})}
      className={cn(
        "glass group block w-full text-left outline-none",
        dense ? "p-3" : "p-3.5",
        interactive &&
          "glass-hover cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/60",
      )}
    >
      {/* Top row: priority dot + title + AI badge */}
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-1 size-2 shrink-0 rounded-full shadow-[0_0_8px_-1px_currentColor]",
            priorityDot(task.priority),
          )}
          aria-label={`${priority.label} priority`}
          title={`${priority.label} priority`}
        />
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-fg line-clamp-2 group-hover:text-white">
          {task.title}
        </p>
        {task.ai_generated && (
          <span
            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30"
            aria-label="AI generated"
          >
            <Sparkles className="size-3" strokeWidth={1.5} aria-hidden />
          </span>
        )}
      </div>

      {/* Chips: type + status */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="chip border-white/[0.06] bg-white/[0.03] font-mono text-[10px] uppercase tracking-wide text-muted">
          {task.type}
        </span>
        <span className={cn("chip border-transparent bg-white/[0.05]", badge.text)}>
          <span
            className={cn("size-1.5 rounded-full shadow-[0_0_6px_-1px_currentColor]", badge.dot)}
            aria-hidden
          />
          {badge.label}
        </span>
      </div>

      {/* Progress */}
      {task.status !== "done" && task.progress > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <ProgressBar value={task.progress} height={5} label={`${task.progress}% complete`} />
          <span className="tnum w-8 shrink-0 text-right text-[11px] text-muted">
            {task.progress}%
          </span>
        </div>
      )}

      {/* Footer: assignee + due */}
      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-white/[0.05] pt-3">
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar name={task.assignee?.name} size={22} />
          <span className="truncate text-xs text-muted">
            {task.assignee?.name ?? "Unassigned"}
          </span>
        </span>
        {task.due_date && (
          <span
            className={cn(
              "tnum flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
              overdue ? "bg-danger/10 text-danger" : "text-muted",
            )}
          >
            <CalendarClock className="size-3" strokeWidth={1.5} aria-hidden />
            {relativeTime(task.due_date)}
          </span>
        )}
      </div>
    </Tag>
  );
}

function priorityDot(priority: number): string {
  if (priority === 1) return "bg-danger";
  if (priority === 2) return "bg-phase-warming";
  return "bg-muted/60";
}
