import { Bug, AlertOctagon, Flame, ListChecks } from "lucide-react";
import { admin } from "@/lib/supabase";
import type { DevIssue, TeamMember } from "@/lib/types";
import PageHeader from "@/components/page-header";
import GlassCard from "@/components/glass-card";
import EmptyState from "@/components/empty-state";
import Stat from "@/components/stat";
import DevBoard from "@/components/dev/dev-board";
import ReportProblem from "@/components/dev/report-problem";

export const dynamic = "force-dynamic";

// Dual-FK disambiguated join (mirror of /api/dev-issues).
const JOIN =
  "*, reporter:team_members!dev_issues_reported_by_fkey(*), assignee:team_members!dev_issues_assignee_id_fkey(*)";

async function loadAll(): Promise<{ issues: DevIssue[]; team: TeamMember[] }> {
  try {
    const db = admin();
    const [issuesRes, teamRes] = await Promise.all([
      db.from("dev_issues").select(JOIN).order("created_at", { ascending: false }),
      db.from("team_members").select("*").order("name", { ascending: true }),
    ]);
    return {
      issues: (issuesRes.data ?? []) as DevIssue[],
      team: (teamRes.data ?? []) as TeamMember[],
    };
  } catch {
    return { issues: [], team: [] };
  }
}

/** "Open" = anything not resolved or closed. */
function isOpen(i: DevIssue): boolean {
  return i.status !== "resolved" && i.status !== "closed";
}

export default async function DevPage() {
  const { issues, team } = await loadAll();

  const open = issues.filter(isOpen);
  const critical = open.filter((i) => i.severity === "critical").length;
  const high = open.filter((i) => i.severity === "high").length;
  const inProgress = issues.filter((i) => i.status === "in_progress").length;

  const reportButton = <ReportProblem team={team} />;

  return (
    <>
      <PageHeader
        title="Dev Board"
        subtitle="See something broken? Tell the team here — anyone can report a problem."
      >
        {reportButton}
      </PageHeader>

      {issues.length === 0 && team.length === 0 ? (
        <EmptyState
          icon={Bug}
          title="No issues yet — and that's a good thing"
          hint="When something breaks, hit “Report a Problem” above. The database may be empty or environment variables are not set."
        />
      ) : (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <GlassCard noHover>
              <Stat label="Open issues" value={open.length} icon={ListChecks} />
            </GlassCard>
            <GlassCard noHover className={critical > 0 ? "border-danger/30" : undefined}>
              <Stat
                label="Critical"
                value={critical}
                icon={AlertOctagon}
                sub={critical > 0 ? "Needs attention now" : "All clear"}
              />
            </GlassCard>
            <GlassCard noHover className={high > 0 ? "border-warning/30" : undefined}>
              <Stat label="High" value={high} icon={Flame} sub={high > 0 ? "Prioritize soon" : "None"} />
            </GlassCard>
            <GlassCard noHover>
              <Stat label="In progress" value={inProgress} icon={Bug} sub="Being worked on" />
            </GlassCard>
          </div>

          <div className="mt-4">
            <DevBoard initialIssues={issues} team={team} />
          </div>
        </>
      )}
    </>
  );
}
