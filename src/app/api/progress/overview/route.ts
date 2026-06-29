// ============================================================
// GET /api/progress/overview  —  Lead Command Center data feed.
//   Optional filter: ?brandId=  (scopes tasks to one brand)
//
// Returns (inside the standard { success, data, error } envelope):
//   data: {
//     rollup: {                      // overall portfolio rollup (see lib/progress)
//       total, done, active, blocked, overdue, percent,
//       byStatus: { backlog, todo, in_progress, blocked, review, done, cancelled }
//     },
//     memberLoad: [                  // per-assignee workload, busiest first
//       { assigneeId, name, role, active, overdue, done, urgent }
//     ],
//     bottlenecks: [                 // up to 10 blocked/overdue tasks, most severe first
//       { id, title, status, priority, due_date, assignee_id, assigneeName, type }
//     ],
//     byType: { content, strategy, script, production, qc, account, dev, general },
//     byBrand: [                     // per-brand rollup (only when not scoped to one brand)
//       { brandId, brandName, rollup: <Rollup> }
//     ],
//     devIssues: {                   // open dev issues bucketed by severity
//       openTotal, bySeverity: { low, medium, high, critical }
//     }
//   }
// ============================================================
import { admin } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { rollup, memberLoad, bottlenecks, type TaskLike } from "@/lib/progress";
import { TASK_TYPES, DEV_SEVERITY } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface TaskRow extends TaskLike {
  title: string;
  type: TaskLike["type"];
  brand_id: string | null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const brandId = url.searchParams.get("brandId");

    // 1. Tasks (optionally scoped to a brand).
    let taskQuery = admin()
      .from("tasks")
      .select("id, title, status, type, priority, progress, due_date, assignee_id, completed_at, brand_id");
    if (brandId) taskQuery = taskQuery.eq("brand_id", brandId);
    const { data: taskData, error: taskErr } = await taskQuery;
    if (taskErr) return err(taskErr.message, 500);
    const tasks = (taskData ?? []) as TaskRow[];

    // 2. Team + brands + dev issues in parallel.
    const [membersRes, brandsRes, issuesRes] = await Promise.all([
      admin().from("team_members").select("id, name, role"),
      admin().from("brands").select("id, name"),
      admin().from("dev_issues").select("id, severity, status"),
    ]);
    if (membersRes.error) return err(membersRes.error.message, 500);
    if (brandsRes.error) return err(brandsRes.error.message, 500);
    if (issuesRes.error) return err(issuesRes.error.message, 500);

    const memberById = new Map<string, { name: string; role: string }>();
    for (const m of membersRes.data ?? [])
      memberById.set(m.id as string, { name: m.name as string, role: m.role as string });
    const brandNameById = new Map<string, string>();
    for (const b of brandsRes.data ?? []) brandNameById.set(b.id as string, b.name as string);

    // 3. Overall rollup.
    const overall = rollup(tasks);

    // 4. Member load enriched with name/role.
    const load = memberLoad(tasks).map((l) => ({
      ...l,
      name: memberById.get(l.assigneeId)?.name ?? null,
      role: memberById.get(l.assigneeId)?.role ?? null,
    }));

    // 5. Bottlenecks (top 10) enriched with title/assignee name.
    const bn = bottlenecks(tasks)
      .slice(0, 10)
      .map((t) => {
        const full = tasks.find((x) => x.id === t.id);
        return {
          id: t.id,
          title: full?.title ?? "",
          status: t.status,
          priority: t.priority,
          due_date: t.due_date,
          assignee_id: t.assignee_id,
          assigneeName: t.assignee_id ? (memberById.get(t.assignee_id)?.name ?? null) : null,
          type: full?.type ?? null,
        };
      });

    // 6. Per-type counts (all task types present, zero-filled).
    const byType: Record<string, number> = {};
    for (const ty of TASK_TYPES) byType[ty] = 0;
    for (const t of tasks) if (t.type) byType[t.type] = (byType[t.type] ?? 0) + 1;

    // 7. Per-brand rollups (skip when scoped to a single brand).
    const byBrand: { brandId: string; brandName: string; rollup: ReturnType<typeof rollup> }[] = [];
    if (!brandId) {
      const grouped = new Map<string, TaskRow[]>();
      for (const t of tasks) {
        if (!t.brand_id) continue;
        const arr = grouped.get(t.brand_id) ?? [];
        arr.push(t);
        grouped.set(t.brand_id, arr);
      }
      for (const [bId, bTasks] of grouped) {
        byBrand.push({
          brandId: bId,
          brandName: brandNameById.get(bId) ?? "Unknown",
          rollup: rollup(bTasks),
        });
      }
      byBrand.sort((a, b) => b.rollup.active - a.rollup.active);
    }

    // 8. Open dev issues by severity.
    const bySeverity: Record<string, number> = {};
    for (const sev of DEV_SEVERITY) bySeverity[sev] = 0;
    let openTotal = 0;
    for (const i of issuesRes.data ?? []) {
      if (i.status === "resolved" || i.status === "closed") continue;
      openTotal++;
      const sev = i.severity as string;
      if (sev in bySeverity) bySeverity[sev]++;
    }

    return ok({
      rollup: overall,
      memberLoad: load,
      bottlenecks: bn,
      byType,
      byBrand,
      devIssues: { openTotal, bySeverity },
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to build overview", 500);
  }
}
