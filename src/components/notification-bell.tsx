"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Loader2, CheckCheck, AlertTriangle, AtSign, UserPlus, Info } from "lucide-react";
import Link from "next/link";
import { cn, relativeTime } from "@/lib/utils";
import type { Notification } from "@/lib/types";

interface NotificationBellProps {
  /** Member id whose inbox to load. If absent, the bell renders disabled. */
  recipientId?: string;
  className?: string;
}

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

const TYPE_ICON: Record<Notification["type"], typeof Info> = {
  info: Info,
  assignment: UserPlus,
  mention: AtSign,
  alert: AlertTriangle,
};

/** Bell with unread badge; opens a dropdown of recent notifications. */
export default function NotificationBell({ recipientId, className }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const unread = items.filter((n) => !n.read).length;

  const load = useCallback(async () => {
    if (!recipientId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/notifications?recipient=${encodeURIComponent(recipientId)}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as Envelope<Notification[]>;
      if (json.success && json.data) setItems(json.data.slice(0, 20));
    } catch {
      // graceful: keep whatever we had
    } finally {
      setLoading(false);
    }
  }, [recipientId]);

  // Initial + periodic refresh.
  useEffect(() => {
    if (!recipientId) return;
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [recipientId, load]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAll() {
    if (!recipientId || unread === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true }))); // optimistic
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId }),
      });
    } catch {
      void load(); // rollback by reloading truth
    }
  }

  const disabled = !recipientId;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-label={
          disabled ? "Notifications (sign in to view)" : `Notifications, ${unread} unread`
        }
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "relative grid size-10 place-items-center rounded-xl border outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary/60",
          disabled
            ? "cursor-not-allowed border-transparent text-muted/50"
            : "border-transparent text-muted hover:bg-surface-2/60 hover:text-fg",
        )}
      >
        <Bell className="size-[18px]" aria-hidden />
        {unread > 0 && (
          <span
            aria-hidden
            className="tnum absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full border border-bg bg-danger px-1 text-[10px] font-semibold leading-[16px] text-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && !disabled && (
        <div
          role="menu"
          aria-label="Notifications"
          className="glass absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
        >
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
            <span className="text-sm font-semibold text-fg">Notifications</span>
            <button
              type="button"
              onClick={markAll}
              disabled={unread === 0}
              className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-primary outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:text-muted/50 disabled:no-underline"
            >
              <CheckCheck className="size-3.5" aria-hidden />
              Mark all read
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading…
              </div>
            ) : items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted">You&apos;re all caught up.</p>
            ) : (
              <ul className="divide-y divide-border/50">
                {items.map((n) => (
                  <NotificationRow key={n.id} n={n} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({ n }: { n: Notification }) {
  const Icon = TYPE_ICON[n.type] ?? Info;
  const body = (
    <div className="flex items-start gap-2.5">
      <span
        className={cn(
          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border",
          n.type === "alert"
            ? "border-danger/40 bg-danger/10 text-danger"
            : "border-border/60 bg-surface-2/50 text-muted",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm", n.read ? "text-muted" : "font-medium text-fg")}>
          {n.title}
        </p>
        {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p>}
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted/70">
          {relativeTime(n.created_at)}
        </p>
      </div>
      {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />}
    </div>
  );

  return (
    <li role="menuitem">
      {n.link ? (
        <Link
          href={n.link}
          className="block px-3 py-2.5 outline-none transition-colors hover:bg-surface-2/50 focus-visible:bg-surface-2/50"
        >
          {body}
        </Link>
      ) : (
        <div className="px-3 py-2.5">{body}</div>
      )}
    </li>
  );
}
