// ============================================================
// GitHub connector — REAL-ish.
// When GITHUB_TOKEN + GITHUB_REPO (owner/repo) are set, pulls open/closed
// issues from the GitHub REST API and upserts them into `dev_issues`,
// mirroring github_issue_number / github_url / github_state. Pull requests
// are skipped (the issues endpoint returns PRs too, flagged by `pull_request`).
// ============================================================
import { admin, nowIso } from "@/lib/supabase";
import type { IntegrationConnector, SyncResult } from "../registry";
import type { DevSeverity } from "@/lib/constants";

const ISSUES_PER_PAGE = 50;

interface GithubLabel {
  name?: string;
}

interface GithubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  labels?: (GithubLabel | string)[];
  pull_request?: unknown;
}

const SEVERITY_VALUES: readonly DevSeverity[] = ["low", "medium", "high", "critical"];

/** Derive a dev-issue severity from GitHub labels, else "medium". */
function severityFromLabels(labels: GithubIssue["labels"]): DevSeverity {
  if (!labels) return "medium";
  for (const raw of labels) {
    const name = (typeof raw === "string" ? raw : (raw.name ?? "")).toLowerCase();
    const hit = SEVERITY_VALUES.find((s) => name.includes(s));
    if (hit) return hit;
  }
  return "medium";
}

export class GithubConnector implements IntegrationConnector {
  readonly provider = "github" as const;

  isConfigured(): boolean {
    return !!process.env.GITHUB_TOKEN && !!process.env.GITHUB_REPO;
  }

  async sync(): Promise<SyncResult> {
    const base: SyncResult = { provider: this.provider, ok: false, itemsSynced: 0 };
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO; // owner/repo
    if (!token || !repo) {
      return { ...base, error: "GITHUB_TOKEN/GITHUB_REPO not set" };
    }

    let issues: GithubIssue[];
    try {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/issues?state=all&per_page=${ISSUES_PER_PAGE}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "cakai-ecosystem",
          },
          cache: "no-store",
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ...base, error: `GitHub API ${res.status}: ${text.slice(0, 200)}` };
      }
      issues = (await res.json()) as GithubIssue[];
    } catch (e) {
      return { ...base, error: e instanceof Error ? e.message : "GitHub fetch failed" };
    }

    // Skip pull requests (issues endpoint mixes them in).
    const realIssues = issues.filter((i) => !i.pull_request);

    let synced = 0;
    try {
      const db = admin();
      for (const issue of realIssues) {
        const row = {
          title: issue.title,
          description: issue.body ?? null,
          github_issue_number: issue.number,
          github_url: issue.html_url,
          github_state: issue.state,
          status: issue.state === "closed" ? "closed" : "open",
          severity: severityFromLabels(issue.labels),
          area: "general",
          updated_at: nowIso(),
        };

        // dev_issues has no unique constraint on github_issue_number, so
        // emulate upsert: update the existing mirror row, else insert.
        const { data: existing } = await db
          .from("dev_issues")
          .select("id")
          .eq("github_issue_number", issue.number)
          .maybeSingle();

        const { error } = existing?.id
          ? await db.from("dev_issues").update(row).eq("id", existing.id)
          : await db.from("dev_issues").insert(row);

        if (!error) synced += 1;
      }
    } catch (e) {
      return { ...base, error: e instanceof Error ? e.message : "dev_issues upsert failed" };
    }

    return {
      provider: this.provider,
      ok: true,
      itemsSynced: synced,
      note: `Synced ${synced}/${realIssues.length} issues from ${repo}`,
    };
  }
}
