"use client";

import { useEffect, useState } from "react";
import { Send, X } from "lucide-react";
import type { Task, TaskComment, TeamMember } from "@/lib/types";
import { TASK_STATUSES, TASK_STATUS_BADGE, TASK_PRIORITY } from "@/lib/constants";
import type { TaskStatus } from "@/lib/constants";
import { cn, relativeTime } from "@/lib/utils";
import Avatar from "@/components/avatar";
import ProgressBar from "@/components/progress-bar";

interface TaskDrawerProps {
  task: Task | null;
  members: TeamMember[];
  onClose: () => void;
  /** Called after a successful PATCH so the board can refresh. */
  onUpdated: (task: Task) => void;
}

async function envelope<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { success: boolean; data: T; error: string | null };
  if (!json.success) throw new Error(json.error ?? "Request failed");
  return json.data;
}

/** Slide-over detail panel: edit status/progress/assignee (PATCH) + comments. */
export default function TaskDrawer({ task, members, onClose, onUpdated }: TaskDrawerProps) {
  const open = Boolean(task);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [draft, setDraft] = useState("");
  const [authorId, setAuthorId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Esc closes; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!task) return;
    setComments([]);
    setDraft("");
    fetch(`/api/tasks/${task.id}/comments`)
      .then(envelope<TaskComment[]>)
      .then(setComments)
      .catch(() => setComments([]));
  }, [task]);

  if (!task) return null;

  async function patch(body: Record<string, unknown>) {
    if (!task) return;
    setSaving(true);
    try {
      const updated = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(envelope<Task>);
      onUpdated({ ...task, ...updated });
    } catch {
      /* keep drawer open; server stays source of truth on next load */
    } finally {
      setSaving(false);
    }
  }

  async function submitComment() {
    if (!task || !draft.trim() || !authorId) return;
    const body = draft.trim();
    setDraft("");
    try {
      const created = await fetch(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author_id: authorId, body }),
      }).then(envelope<TaskComment>);
      setComments((prev) => [...prev, created]);
    } catch {
      setDraft(body);
    }
  }

  const badge = TASK_STATUS_BADGE[task.status];
  const priority = TASK_PRIORITY[task.priority] ?? TASK_PRIORITY[3];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Task detail">
      <button
        type="button"
        aria-label="Close detail"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-up"
      />
      <aside className="glass relative flex h-full w-full max-w-md flex-col overflow-y-auto rounded-none border-y-0 border-r-0 p-6 animate-fade-up">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className={cn("chip mb-3 border-transparent bg-white/[0.05]", badge.text)}>
              <span
                className={cn("size-1.5 rounded-full shadow-[0_0_6px_-1px_currentColor]", badge.dot)}
                aria-hidden
              />
              {badge.label}
            </span>
            <h2 className="font-display text-xl font-bold leading-snug text-fg">{task.title}</h2>
            <p className={cn("mt-1.5 text-xs font-medium", priority.tone)}>
              {priority.label} priority · {task.type}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-muted outline-none transition-all hover:bg-white/[0.1] hover:text-fg focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <X className="size-5" strokeWidth={1.5} aria-hidden />
          </button>
        </header>

        {task.description && (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted">
            {task.description}
          </p>
        )}

        {/* Status control */}
        <Field label="Status">
          <div className="flex flex-wrap gap-1.5">
            {TASK_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={saving}
                onClick={() => patch({ status: s })}
                aria-pressed={task.status === s}
                className={cn(
                  "chip min-h-[34px] cursor-pointer outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50",
                  task.status === s
                    ? cn("border-white/15 bg-white/[0.08] shadow-[0_4px_14px_-6px_rgba(0,0,0,0.7)]", TASK_STATUS_BADGE[s].text)
                    : "border-white/[0.07] text-muted hover:border-white/15 hover:text-fg",
                )}
              >
                {TASK_STATUS_BADGE[s].label}
              </button>
            ))}
          </div>
        </Field>

        {/* Progress control */}
        <Field label={`Progress · ${task.progress}%`}>
          <ProgressBar value={task.progress} height={8} />
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            defaultValue={task.progress}
            aria-label="Set progress"
            disabled={saving}
            onMouseUp={(e) => patch({ progress: Number((e.target as HTMLInputElement).value) })}
            onTouchEnd={(e) => patch({ progress: Number((e.target as HTMLInputElement).value) })}
            className="mt-2 w-full accent-primary"
          />
        </Field>

        {/* Assignee control */}
        <Field label="Assignee">
          <select
            value={task.assignee_id ?? ""}
            disabled={saving}
            onChange={(e) => patch({ assignee_id: e.target.value || null })}
            aria-label="Reassign task"
            className="min-h-[40px] w-full rounded-xl border border-white/[0.08] bg-black/20 px-3.5 text-sm text-fg outline-none transition-colors hover:border-white/15 focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>

        {/* Comments */}
        <Field label={`Comments · ${comments.length}`}>
          <ul className="flex flex-col gap-3">
            {comments.length === 0 && (
              <li className="text-xs text-muted">No comments yet.</li>
            )}
            {comments.map((c) => (
              <li key={c.id} className="flex gap-2.5">
                <Avatar name={c.author?.name} size={28} />
                <div className="min-w-0 flex-1 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                  <p className="flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span className="truncate font-medium text-fg">
                      {c.author?.name ?? "Unknown"}
                    </span>
                    <span className="tnum shrink-0">{relativeTime(c.created_at)}</span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-fg/90">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-col gap-2">
            <select
              value={authorId}
              onChange={(e) => setAuthorId(e.target.value)}
              aria-label="Comment as"
              className="min-h-[40px] w-full rounded-xl border border-white/[0.08] bg-black/20 px-3.5 text-sm text-fg outline-none transition-colors hover:border-white/15 focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <option value="">Comment as…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitComment()}
                placeholder="Add a comment…"
                aria-label="Comment body"
                className="min-h-[40px] flex-1 rounded-xl border border-white/[0.08] bg-black/20 px-3.5 text-sm text-fg outline-none transition-colors placeholder:text-muted/50 hover:border-white/15 focus-visible:ring-2 focus-visible:ring-primary/60"
              />
              <button
                type="button"
                onClick={submitComment}
                disabled={!draft.trim() || !authorId}
                aria-label="Send comment"
                className="grid size-10 shrink-0 place-items-center rounded-full text-white outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-40"
                style={{
                  background:
                    "linear-gradient(180deg, rgb(var(--primary)), rgb(var(--primary) / 0.82))",
                }}
              >
                <Send className="size-4" strokeWidth={1.5} aria-hidden />
              </button>
            </div>
          </div>
        </Field>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <p className="mb-2 font-mono text-[11px] font-medium uppercase tracking-widest text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}
