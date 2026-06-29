import { Users, CircleCheck, ShieldAlert, Activity } from "lucide-react";
import { loadBrands, loadAccounts } from "@/lib/dash-data";
import { fmtPct } from "@/lib/utils";
import PageHeader from "@/components/page-header";
import GlassCard from "@/components/glass-card";
import Stat from "@/components/stat";
import WarmupBar from "@/components/warmup-bar";
import AccountsClient from "@/components/accounts-client";
import EmptyState from "@/components/empty-state";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const { brands, selected } = await loadBrands();
  const accounts = selected ? await loadAccounts(selected.id) : [];

  const active = accounts.filter((a) => a.status === "active").length;
  const anomalies = accounts.filter(
    (a) => (a.anomaly_flags?.length ?? 0) > 0 || a.status === "flagged",
  ).length;
  const avgEng =
    accounts.length > 0
      ? accounts.reduce((s, a) => s + (a.engagement_rate ?? 0), 0) / accounts.length
      : 0;

  return (
    <>
      <PageHeader
        eyebrow="Operations · Warmup Monitor"
        title="Accounts"
        subtitle="Warmup phases, health, and anomaly monitoring"
      />

      {!selected ? (
        <EmptyState
          icon={Users}
          title="No brands configured"
          hint="Add a brand to start tracking its accounts. The database may be empty or environment variables are not set."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Asymmetric bento summary — flagship total tile leads (double-bezel), supporting tiles follow */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="bezel animate-fade-up col-span-2">
              <div className="glass glass-hover flex h-full items-center justify-between gap-4 p-5">
                <Stat
                  label="Total Accounts"
                  value={accounts.length}
                  icon={Users}
                  sub={selected.name}
                />
                <span
                  aria-hidden
                  className="hidden size-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-primary glow-primary sm:grid"
                >
                  <Users className="size-5" strokeWidth={1.5} />
                </span>
              </div>
            </div>
            <GlassCard className="animate-fade-up [animation-delay:60ms]">
              <Stat label="Active" value={active} icon={CircleCheck} tone="text-phase-active" />
            </GlassCard>
            <GlassCard className="animate-fade-up [animation-delay:120ms]">
              <Stat
                label="Anomalies"
                value={anomalies}
                icon={ShieldAlert}
                tone={anomalies > 0 ? "text-danger" : undefined}
              />
            </GlassCard>
            <GlassCard className="animate-fade-up [animation-delay:160ms] col-span-2 lg:col-span-2">
              <Stat label="Avg Engagement" value={fmtPct(avgEng)} icon={Activity} />
            </GlassCard>
          </div>

          {/* Warmup distribution — wide bento tile */}
          <GlassCard
            title="Warmup Distribution"
            className="animate-fade-up [animation-delay:160ms]"
            noHover
          >
            <WarmupBar accounts={accounts} />
          </GlassCard>

          {/* Interactive island: selector + tabs + scan + grid */}
          <div className="animate-fade-up [animation-delay:200ms]">
            <AccountsClient
              brands={brands.map((b) => ({ id: b.id, name: b.name }))}
              initialBrandId={selected.id}
              initialAccounts={accounts}
            />
          </div>
        </div>
      )}
    </>
  );
}
