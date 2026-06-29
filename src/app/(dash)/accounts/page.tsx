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
      <PageHeader title="Accounts" subtitle="Warmup phases, health, and anomaly monitoring" />

      {!selected ? (
        <EmptyState
          icon={Users}
          title="No brands configured"
          hint="Add a brand to start tracking its accounts. The database may be empty or environment variables are not set."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Bento summary grid — varying tile sizes */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <GlassCard noHover>
              <Stat label="Total Accounts" value={accounts.length} icon={Users} sub={selected.name} />
            </GlassCard>
            <GlassCard noHover>
              <Stat label="Active" value={active} icon={CircleCheck} />
            </GlassCard>
            <GlassCard noHover>
              <Stat label="Anomalies" value={anomalies} icon={ShieldAlert} />
            </GlassCard>
            <GlassCard noHover>
              <Stat label="Avg Engagement" value={fmtPct(avgEng)} icon={Activity} />
            </GlassCard>
          </div>

          {/* Warmup distribution — wide bento tile */}
          <GlassCard title="Warmup Distribution" noHover>
            <WarmupBar accounts={accounts} />
          </GlassCard>

          {/* Interactive island: selector + tabs + scan + grid */}
          <AccountsClient
            brands={brands.map((b) => ({ id: b.id, name: b.name }))}
            initialBrandId={selected.id}
            initialAccounts={accounts}
          />
        </div>
      )}
    </>
  );
}
