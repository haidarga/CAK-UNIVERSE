"use client";

// ============================================================
// CopilotThreadList — the chat history panel (slides over the
// message area). Each row switches to that thread; the trash
// button deletes it. Includes a "New chat" action at the top.
// ============================================================
import { Plus, Trash2, MessageSquare } from "lucide-react";
import type { CopilotThread } from "@/lib/types";

/** Compact relative time, e.g. "now", "5m", "3h", "2d", or a date. */
function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString();
}

interface ThreadListProps {
  threads: CopilotThread[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
}

export default function CopilotThreadList({
  threads,
  activeId,
  onSelect,
  onDelete,
  onNewChat,
}: ThreadListProps) {
  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={onNewChat}
        className="chip glass-hover m-3 justify-center gap-2 py-2.5 font-medium"
      >
        <Plus className="size-4" strokeWidth={1.5} aria-hidden />
        New chat
      </button>

      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {threads.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted">
            No saved chats yet. Start a conversation to build memory.
          </p>
        ) : (
          threads.map((t) => {
            const isActive = t.id === activeId;
            return (
              <div
                key={t.id}
                className={`group flex items-center gap-2 rounded-xl px-2.5 py-2 transition-colors ${
                  isActive ? "bg-primary/15" : "glass-hover"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-current={isActive ? "true" : undefined}
                >
                  <MessageSquare
                    className={`size-4 shrink-0 ${isActive ? "text-primary" : "text-muted"}`}
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                    {t.title || "Untitled chat"}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted">
                    {relativeTime(t.last_message_at)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(t.id)}
                  className="btn-icon size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Delete chat: ${t.title || "Untitled chat"}`}
                  title="Delete chat"
                >
                  <Trash2 className="size-3.5 text-danger" strokeWidth={1.5} aria-hidden />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
