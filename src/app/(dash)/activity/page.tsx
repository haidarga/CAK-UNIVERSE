import { Activity as ActivityIcon } from "lucide-react";
import { admin } from "@/lib/supabase";
import { relativeTime } from "@/lib/utils";
import type { ActivityLog, Brand } from "@/lib/types";
import PageHeader from "@/components/page-header";
import EmptyState from "@/components/empty-state";
import Avatar from "@/components/avatar";

export const dynamic = "force-dynamic";

const FEED_LIMIT = 100;

async function loadFeed(): Promise<{ logs: ActivityLog[]; brandNames: Map<string, string> }> {
  try {
    const db = admin();
    const [logRes, brandRes] = await Promise.all([
      db
        .from("activity_log")
        .select("*, actor:team_members(*)")
        .order("created_at", { ascending: false })
        .limit(FEED_LIMIT),
      db.from("brands").select("id, name"),
    ]);
    const brands = (brandRes.data ?? []) as Pick<Brand, "id" | "name">[];
    return {
      logs: (logRes.data ?? []) as ActivityLog[],
      brandNames: new Map(brands.map((b) => [b.id, b.name])),
    };
  } catch {
    return { logs: [], brandNames: new Map() };
  }
}

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10); // YYYY-MM-DD
}

function dayLabel(key: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function groupByDay(logs: ActivityLog[]): { key: string; items: ActivityLog[] }[] {
  const groups: { key: string; items: ActivityLog[] }[] = [];
  for (const log of logs) {
    const key = dayKey(log.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(log);
    else groups.push({ key, items: [log] });
  }
  return groups;
}

function verb(action: string): string {
  return action.replace(/[_.]+/g, " ");
}

export default async function ActivityPage() {
  const { logs, brandNames } = await loadFeed();

  if (logs.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Live Feed"
          title="Activity"
          subtitle="Everything happening across the team"
        />
        <EmptyState
          icon={ActivityIcon}
          title="No activity yet"
          hint="As the team works on tasks, pipelines, and accounts, every action shows up here. The database may be empty or environment variables are not set."
        />
      </>
    );
  }

  const groups = groupByDay(logs);

  return (
    <>
      <PageHeader title="Activity" subtitle="Everything happening across the team" />

      <div className="flex flex-col gap-9">
        {groups.map((group) => (
          <section key={group.key} aria-label={dayLabel(group.key)} className="animate-fade-up">
            <h2 className="mb-4">
              <span className="eyebrow">{dayLabel(group.key)}</span>
            </h2>
            <ol className="relative flex flex-col gap-1 pl-1">
              {/* Timeline rail */}
              <span
                aria-hidden
                className="absolute left-[27px] top-4 bottom-4 w-px bg-gradient-to-b from-primary/40 via-border/50 to-transparent"
              />
              {group.items.map((log) => (
                <ActivityRow
                  key={log.id}
                  log={log}
                  brand={log.brand_id ? brandNames.get(log.brand_id) : undefined}
                />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}

function ActivityRow({ log, brand }: { log: ActivityLog; brand?: string }) {
  const actorName = log.actor?.name ?? "System";
  return (
    <li className="group relative flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.02]">
      <span className="relative z-10 shrink-0">
        <Avatar name={log.actor?.name ?? null} size={32} />
        {/* glowing timeline node */}
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-bg shadow-[0_0_8px_0_rgb(var(--primary)/0.9)]"
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-fg">
          <span className="font-semibold">{actorName}</span>{" "}
          <span className="text-muted">{verb(log.action)}</span>
          {brand && (
            <span className="chip ml-2 border-white/10 bg-white/[0.04] text-muted">{brand}</span>
          )}
        </p>
        {log.summary && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted">{log.summary}</p>
        )}
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted/60">
          {relativeTime(log.created_at)}
        </p>
      </div>
    </li>
  );
}
