import { Instagram, Music2, Users, Activity, Send, Clock, AlertTriangle } from "lucide-react";
import type { Account } from "@/lib/types";
import { cn, fmtCompact, fmtPct, relativeTime } from "@/lib/utils";
import PhaseBadge from "./phase-badge";
import WarmupButton from "./warmup-button";
import AccountConnect from "./account-connect";

function PlatformIcon({ platform }: { platform: Account["platform"] }) {
  const Icon = platform === "instagram" ? Instagram : Music2;
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-fg/80 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
      <Icon className="size-3.5" aria-label={platform} strokeWidth={1.5} />
    </span>
  );
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
    <div className="flex flex-col gap-0.5 rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5">
      <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted">
        <Icon className="size-3" aria-hidden strokeWidth={1.5} />
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
        flagged && "border-danger/40 shadow-[0_0_0_1px_rgba(248,113,113,0.25),0_0_36px_-10px_rgba(248,113,113,0.5)]",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <PlatformIcon platform={account.platform} />
          <div className="min-w-0">
            <span className="block truncate font-sans text-base font-semibold text-fg">
              @{account.username}
            </span>
            <span className="tnum font-mono text-[10px] uppercase tracking-widest text-muted">
              limit {account.daily_post_limit}/day
            </span>
          </div>
        </div>
        <PhaseBadge phase={account.status === "flagged" ? "flagged" : account.warmup_phase} />
      </header>

      {/* Headline follower readout */}
      <div className="flex items-baseline gap-2">
        <span className="tnum font-display text-3xl font-bold leading-none text-fg">
          {fmtCompact(account.follower_count)}
        </span>
        <span className="flex items-center gap-1 text-xs font-medium text-muted">
          <Users className="size-3.5" aria-hidden strokeWidth={1.5} />
          followers
        </span>
        <span className="ml-auto tnum text-sm font-semibold text-success">
          {fmtPct(account.engagement_rate)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Metric icon={Activity} label="Eng. Rate" value={fmtPct(account.engagement_rate)} />
        <Metric icon={Send} label="Posts" value={fmtCompact(account.total_posts)} />
        <Metric icon={Clock} label="Last Post" value={relativeTime(account.last_posted_at)} />
        <Metric icon={Users} label="Followers" value={fmtCompact(account.follower_count)} />
      </div>

      {anomalies.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
          {anomalies.map((flag) => (
            <span
              key={flag}
              className="chip border-danger/40 bg-danger/10 text-danger shadow-[0_0_18px_-6px_rgba(248,113,113,0.7)]"
            >
              <AlertTriangle className="size-3" aria-hidden strokeWidth={1.5} />
              {flag}
            </span>
          ))}
        </div>
      )}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
        <AccountConnect
          accountId={account.id}
          platform={account.platform}
          username={account.username}
        />
        <WarmupButton accountId={account.id} />
      </footer>
    </article>
  );
}
