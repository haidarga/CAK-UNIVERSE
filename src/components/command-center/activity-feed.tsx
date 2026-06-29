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
    <ol className="relative flex flex-col gap-4">
      {/* Timeline rail */}
      <span
        className="absolute left-[17px] top-2 bottom-2 w-px bg-border/60"
        aria-hidden
      />
      {items.map((a) => (
        <li key={a.id} className="relative flex gap-3">
          <Avatar name={a.actor === "System" ? null : a.actor} size={34} className="z-10" />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm leading-snug text-fg">
              <span className="font-medium">{a.actor}</span>{" "}
              <span className="text-muted">{humanize(a.action)}</span>
            </p>
            {a.summary && (
              <p className="mt-0.5 truncate text-xs text-muted">{a.summary}</p>
            )}
            <span className="tnum mt-0.5 block text-[11px] text-muted/70">
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
