import type { ComponentType } from "react";
import {
  Blocks,
  FileText,
  Sheet,
  HardDrive,
  Music2,
  Instagram,
  Youtube,
  TrendingUp,
  Send,
  Github,
  BarChart3,
  Plug,
  CheckCircle2,
  CircleSlash,
  KeyRound,
  Clock,
  Layers,
  Zap,
} from "lucide-react";
import { buildCatalog, type CatalogEntry } from "@/lib/integrations/catalog";
import type { ProviderCategory } from "@/lib/integrations/registry";
import PageHeader from "@/components/page-header";
import EmptyState from "@/components/empty-state";
import SyncButton from "@/components/integrations/sync-button";
import { cn, relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

type IconCmp = ComponentType<{ className?: string; "aria-hidden"?: boolean; strokeWidth?: number }>;

// Safe lookup: registry icon string -> lucide component (fallback Plug).
const ICONS: Record<string, IconCmp> = {
  FileText,
  Sheet,
  HardDrive,
  Music2,
  Instagram,
  Youtube,
  TrendingUp,
  Send,
  Github,
  BarChart3,
};

function iconFor(name: string): IconCmp {
  return ICONS[name] ?? Plug;
}

const CATEGORY_ORDER: ProviderCategory[] = [
  "docs",
  "social",
  "growth",
  "publishing",
  "dev",
  "analytics",
];

const CATEGORY_LABEL: Record<ProviderCategory, string> = {
  docs: "Docs & Files",
  social: "Social Platforms",
  growth: "Growth Ops",
  publishing: "Publishing",
  dev: "Developer",
  analytics: "Analytics",
};

type StatusKind = "connected" | "needs_env" | "not_configured";

function statusOf(entry: CatalogEntry): StatusKind {
  if (!entry.configured) return "needs_env";
  if (entry.connection?.status === "connected") return "connected";
  return "not_configured";
}

export default async function IntegrationsPage() {
  let catalog: CatalogEntry[] = [];
  try {
    catalog = await buildCatalog();
  } catch {
    catalog = [];
  }

  const connectedCount = catalog.filter((c) => statusOf(c) === "connected").length;

  if (catalog.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Marketplace"
          title="Integrations"
          subtitle="Connect external tools into the platform."
        />
        <EmptyState
          icon={Blocks}
          title="No providers available"
          hint="The integration registry is empty or environment variables are not set."
        />
      </>
    );
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: catalog.filter((c) => c.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader
        eyebrow="Marketplace"
        title="Integrations"
        subtitle={`Marketplace of tools wired into the platform — ${connectedCount}/${catalog.length} connected.`}
      />

      <div className="flex flex-col gap-10">
        {grouped.map((group, gi) => (
          <section
            key={group.category}
            className="animate-fade-up"
            style={{ animationDelay: `${gi * 60}ms` }}
          >
            <h2 className="eyebrow mb-4 flex items-center gap-2">
              <Blocks className="size-3.5" strokeWidth={1.5} aria-hidden />
              {CATEGORY_LABEL[group.category]}
            </h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((entry, ci) => (
                <ProviderCard key={entry.id} entry={entry} delay={gi * 60 + ci * 40} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function ProviderCard({ entry, delay = 0 }: { entry: CatalogEntry; delay?: number }) {
  const Icon = iconFor(entry.icon);
  const status = statusOf(entry);
  const lastSynced = entry.connection?.last_synced_at ?? null;
  const lastError = entry.connection?.last_error ?? null;
  const isConnected = status === "connected";

  return (
    <article className="bezel animate-fade-up h-full" style={{ animationDelay: `${delay}ms` }}>
      <div className="glass glass-hover flex h-full flex-col gap-4 p-5">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <span
              className={cn(
                "grid size-12 shrink-0 place-items-center rounded-2xl border transition-colors",
                isConnected
                  ? "glow-primary border-primary/40 bg-primary/15 text-primary"
                  : "border-border/60 bg-surface-2/70 text-fg",
              )}
            >
              <Icon className="size-6" strokeWidth={1.5} aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="font-display truncate text-base font-semibold text-fg">
                {entry.label}
              </h3>
              <span className="chip mt-1.5 inline-block border-border/60 bg-surface-2/60 capitalize text-muted">
                {entry.category}
              </span>
            </div>
          </div>
          <StatusPill status={status} />
        </header>

        <ul className="flex flex-col gap-2">
          {entry.capabilities.map((cap) => (
            <li key={cap} className="flex items-start gap-2 text-xs leading-relaxed text-muted">
              <Zap className="mt-0.5 size-3.5 shrink-0 text-accent" strokeWidth={1.5} aria-hidden />
              <span>{cap}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-1.5">
          <Layers className="size-3.5 text-muted" strokeWidth={1.5} aria-hidden />
          {entry.surfaces.map((s) => (
            <span key={s} className="chip border-border/50 bg-surface-2/50 text-[10px] text-muted">
              {s}
            </span>
          ))}
        </div>

        {entry.envVars.length > 0 && (
          <div className="rounded-xl border border-border/40 bg-surface-2/40 px-3.5 py-2.5">
            <p className="eyebrow mb-1.5 flex items-center gap-1.5">
              <KeyRound className="size-3" strokeWidth={1.5} aria-hidden />
              Required env
            </p>
            <div className="flex flex-wrap gap-1.5">
              {entry.envVars.map((v) => (
                <code
                  key={v}
                  className={cn(
                    "rounded-md px-1.5 py-0.5 font-mono text-[10px]",
                    entry.configured
                      ? "bg-success/10 text-success"
                      : "bg-warning/10 text-warning",
                  )}
                >
                  {v}
                </code>
              ))}
            </div>
          </div>
        )}

        <footer className="mt-auto flex items-end justify-between gap-3 border-t border-border/40 pt-3.5">
          <div className="min-w-0 text-[10px] text-muted">
            <span className="flex items-center gap-1">
              <Clock className="size-3" strokeWidth={1.5} aria-hidden />
              {lastSynced ? `Synced ${relativeTime(lastSynced)}` : "Never synced"}
            </span>
            {lastError && (
              <span className="mt-0.5 block truncate text-danger" title={lastError}>
                {lastError}
              </span>
            )}
          </div>
          <SyncButton provider={entry.id} disabled={!entry.configured} />
        </footer>
      </div>
    </article>
  );
}

function StatusPill({ status }: { status: StatusKind }) {
  const map: Record<StatusKind, { label: string; icon: IconCmp; cls: string }> = {
    connected: {
      label: "Connected",
      icon: CheckCircle2,
      cls: "border-success/40 bg-success/10 text-success shadow-[0_0_18px_-4px] shadow-success/40",
    },
    needs_env: {
      label: "Needs env",
      icon: KeyRound,
      cls: "border-warning/40 bg-warning/10 text-warning",
    },
    not_configured: {
      label: "Not connected",
      icon: CircleSlash,
      cls: "border-border/60 bg-surface-2/50 text-muted",
    },
  };
  const { label, icon: PillIcon, cls } = map[status];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-medium",
        cls,
      )}
    >
      <PillIcon className="size-3" strokeWidth={1.5} aria-hidden />
      {label}
    </span>
  );
}
