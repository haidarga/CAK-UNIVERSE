import { relativeTime } from "@/lib/utils";
import Avatar from "@/components/avatar";

export interface ActivityItem {
  id: string;
  actor: string;
  action: string;
  summary: string | null;
  createdAt: string;
}

/** Right-rail live feed: who did what, when. */
export default function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">No activity recorded yet.</p>;
  }

  return (
    <ol className="relative flex flex-col gap-5">
      {/* Timeline rail */}
      <span
        className="absolute left-[17px] top-3 bottom-3 w-px bg-gradient-to-b from-primary/40 via-border/50 to-transparent"
        aria-hidden
      />
      {items.map((a) => (
        <li key={a.id} className="relative flex gap-3">
          <span className="relative z-10 shrink-0">
            <Avatar name={a.actor === "System" ? null : a.actor} size={34} />
            {/* glowing node */}
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-bg shadow-[0_0_8px_0_rgb(var(--primary)/0.9)]"
            />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm leading-snug text-fg">
              <span className="font-semibold">{a.actor}</span>{" "}
              <span className="text-muted">{humanize(a.action)}</span>
            </p>
            {a.summary && (
              <p className="mt-0.5 truncate text-xs text-muted">{a.summary}</p>
            )}
            <span className="tnum mt-1 block font-mono text-[10px] uppercase tracking-widest text-muted/60">
              {relativeTime(a.createdAt)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// "task.status_changed" -> "changed task status"
function humanize(action: string): string {
  return action.replace(/[._]/g, " ").trim();
}
