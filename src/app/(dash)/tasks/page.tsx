import { ListChecks } from "lucide-react";
import { admin } from "@/lib/supabase";
import type { Task, TeamMember, Brand } from "@/lib/types";
import PageHeader from "@/components/page-header";
import EmptyState from "@/components/empty-state";
import TasksBoard from "@/components/tasks-board";

export const dynamic = "force-dynamic";

async function loadTeam(): Promise<TeamMember[]> {
  try {
    const { data, error } = await admin()
      .from("team_members")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as TeamMember[];
  } catch {
    return [];
  }
}

async function loadTasks(): Promise<Task[]> {
  try {
    const { data, error } = await admin()
      .from("tasks")
      .select("*, assignee:team_members!assignee_id(*), brands(*)")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Task[];
  } catch {
    return [];
  }
}

async function loadBrands(): Promise<Pick<Brand, "id" | "name">[]> {
  try {
    const { data, error } = await admin()
      .from("brands")
      .select("id, name")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Pick<Brand, "id" | "name">[];
  } catch {
    return [];
  }
}

export default async function TasksPage() {
  const [team, tasks, brands] = await Promise.all([loadTeam(), loadTasks(), loadBrands()]);

  return (
    <>
      <PageHeader
        eyebrow="Command"
        title="Tasks"
        subtitle="My Tasks & Team Tasks — drag the team toward done"
      />

      {team.length === 0 && tasks.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No team or tasks yet"
          hint="Add team members and create tasks to populate the board. The database may be empty or environment variables are not set."
        />
      ) : (
        <TasksBoard initialTasks={tasks} members={team} brands={brands} />
      )}
    </>
  );
}
