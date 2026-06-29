import { Instagram, Music2, Users, Activity, Send, Clock, AlertTriangle } from "lucide-react";
import type { Account } from "@/lib/types";
import { cn, fmtCompact, fmtPct, relativeTime } from "@/lib/utils";
import PhaseBadge from "./phase-badge";

function PlatformIcon({ platform }: { platform: Account["platform"] }) {
  const Icon = platform === "instagram" ? Instagram : Music2;
  return <Icon className="size-4 text-muted" aria-label={platform} />;
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted">
        <Icon className="size-3" aria-hidden />
        {label}
      </span>
      <span className="tnum text-sm font-semibold text-fg">{value}</span>
    </div>
  );
}

/** Single account tile. Anomalies get a danger ring + danger chips. */
export default function AccountCard({ account }: { account: Account }) {
  const anomalies = account.anomaly_flags ?? [];
  const flagged = anomalies.length > 0 || account.status === "flagged";

  return (
    <article
      className={cn(
        "glass glass-hover flex flex-col gap-4 p-5",
        flagged && "border-danger/40 ring-1 ring-danger/30",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <PlatformIcon platform={account.platform} />
            <span className="truncate font-sans text-base font-semibold text-fg">
              @{account.username}
            </span>
          </div>
          <span className="tnum font-mono text-[10px] uppercase tracking-widest text-muted">
            limit {account.daily_post_limit}/day
          </span>
        </div>
        <PhaseBadge phase={account.status === "flagged" ? "flagged" : account.warmup_phase} />
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Metric icon={Users} label="Followers" value={fmtCompact(account.follower_count)} />
        <Metric icon={Activity} label="Eng. Rate" value={fmtPct(account.engagement_rate)} />
        <Metric icon={Send} label="Posts" value={fmtCompact(account.total_posts)} />
        <Metric icon={Clock} label="Last Post" value={relativeTime(account.last_posted_at)} />
      </div>

      {anomalies.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
          {anomalies.map((flag) => (
            <span key={flag} className="chip border-danger/40 bg-danger/10 text-danger">
              <AlertTriangle className="size-3" aria-hidden />
              {flag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
