import { describe, test, expect } from "vitest";
import { isOverdue, rollup, memberLoad, bottlenecks, type TaskLike } from "@/lib/progress";

const NOW = new Date("2026-06-28T00:00:00Z").getTime();
const daysFromNow = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

function task(over: Partial<TaskLike> = {}): TaskLike {
  return {
    id: Math.random().toString(36).slice(2),
    status: "todo",
    progress: 0,
    priority: 3,
    due_date: null,
    assignee_id: "u1",
    ...over,
  };
}

describe("isOverdue", () => {
  test("past due + not done => overdue", () => {
    expect(isOverdue(task({ due_date: daysFromNow(-1) }), NOW)).toBe(true);
  });
  test("done is never overdue", () => {
    expect(isOverdue(task({ due_date: daysFromNow(-5), status: "done" }), NOW)).toBe(false);
  });
  test("no due date => not overdue", () => {
    expect(isOverdue(task({ due_date: null }), NOW)).toBe(false);
  });
});

describe("rollup", () => {
  test("computes counts and percent, excluding cancelled", () => {
    const r = rollup(
      [
        task({ status: "done", progress: 100 }),
        task({ status: "in_progress", progress: 50 }),
        task({ status: "todo", progress: 0 }),
        task({ status: "cancelled", progress: 0 }),
      ],
      NOW,
    );
    expect(r.total).toBe(3); // cancelled excluded
    expect(r.done).toBe(1);
    expect(r.active).toBe(2);
    expect(r.percent).toBe(50); // (100 + 50 + 0) / 3
    expect(r.byStatus.cancelled).toBe(1);
  });

  test("done forces 100 even if progress field lags", () => {
    const r = rollup([task({ status: "done", progress: 0 })], NOW);
    expect(r.percent).toBe(100);
  });

  test("empty list => 0 percent, no NaN", () => {
    expect(rollup([], NOW).percent).toBe(0);
  });

  test("counts overdue and blocked", () => {
    const r = rollup(
      [task({ status: "blocked" }), task({ status: "todo", due_date: daysFromNow(-2) })],
      NOW,
    );
    expect(r.blocked).toBe(1);
    expect(r.overdue).toBe(1);
  });
});

describe("memberLoad", () => {
  test("aggregates per assignee and sorts by active desc", () => {
    const loads = memberLoad(
      [
        task({ assignee_id: "a", status: "in_progress" }),
        task({ assignee_id: "a", status: "todo", priority: 1 }),
        task({ assignee_id: "b", status: "done" }),
      ],
      NOW,
    );
    expect(loads[0].assigneeId).toBe("a");
    expect(loads[0].active).toBe(2);
    expect(loads[0].urgent).toBe(1);
    const b = loads.find((l) => l.assigneeId === "b")!;
    expect(b.done).toBe(1);
    expect(b.active).toBe(0);
  });

  test("ignores unassigned tasks", () => {
    expect(memberLoad([task({ assignee_id: null })], NOW)).toEqual([]);
  });
});

describe("bottlenecks", () => {
  test("returns blocked + overdue, most urgent first", () => {
    const b = bottlenecks(
      [
        task({ id: "x", status: "blocked", priority: 2 }),
        task({ id: "y", status: "todo", due_date: daysFromNow(-1), priority: 1 }),
        task({ id: "z", status: "todo" }),
      ],
      NOW,
    );
    expect(b.map((t) => t.id)).toEqual(["y", "x"]);
  });
});
