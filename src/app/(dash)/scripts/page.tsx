import { FileText, ChevronDown, ShieldAlert } from "lucide-react";
import { loadBrands, loadPipeline } from "@/lib/dash-data";
import PageHeader from "@/components/page-header";
import BrandSelector from "@/components/brand-selector";
import PhaseBadge from "@/components/phase-badge";
import EmptyState from "@/components/empty-state";

export const dynamic = "force-dynamic";

const SCRIPT_STAGES = ["scripted", "script_reviewed", "guardrail_review"];

const STAGE_LABEL: Record<string, string> = {
  scripted: "Scripted",
  script_reviewed: "Script Reviewed",
  guardrail_review: "Guardrail Review",
};

export default async function ScriptsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const { brands, selected } = await loadBrands(brand);
  const items = selected ? await loadPipeline(selected.id, SCRIPT_STAGES) : [];
  const withScript = items.filter((i) => i.script?.text);

  return (
    <>
      <PageHeader
        eyebrow="Operations · Review"
        title="Scripts"
        subtitle="Drafted scripts awaiting review and guardrail checks"
      >
        <BrandSelector
          brands={brands.map((b) => ({ id: b.id, slug: b.slug, name: b.name }))}
          selected={selected?.slug}
        />
      </PageHeader>

      {!selected ? (
        <EmptyState
          icon={FileText}
          title="No brands configured"
          hint="Add a brand to review its scripts. The database may be empty or environment variables are not set."
        />
      ) : withScript.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No scripts yet"
          hint="Scripts appear here once a brief reaches the scripted stage."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {withScript.map((item, i) => {
            const title = item.content_direction?.title ?? "Untitled script";
            const guardrail = item.qc_report?.guardrail_flag === true;
            const preview = item.script?.text ?? "";
            return (
              <details
                key={item.id}
                className="glass glass-hover animate-fade-up group overflow-hidden p-0 [&_summary::-webkit-details-marker]:hidden"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-primary/60">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-muted">
                      <FileText className="size-4" aria-hidden strokeWidth={1.5} />
                    </span>
                    <span className="truncate text-sm font-semibold text-fg">{title}</span>
                    <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted sm:inline">
                      v{item.script?.version ?? 1}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {guardrail && (
                      <span className="chip border-danger/40 bg-danger/10 text-danger shadow-[0_0_20px_-6px_rgba(248,113,113,0.7)]">
                        <ShieldAlert className="size-3" aria-hidden strokeWidth={1.5} />
                        Guardrail
                      </span>
                    )}
                    <PhaseBadge phase={item.stage === "guardrail_review" ? "flagged" : "warm"} />
                    <span className="hidden text-xs text-muted md:inline">
                      {STAGE_LABEL[item.stage] ?? item.stage}
                    </span>
                    <ChevronDown
                      className="size-4 text-muted transition-transform duration-300 group-open:rotate-180"
                      aria-hidden
                      strokeWidth={1.5}
                    />
                  </div>
                </summary>
                <div className="border-t border-border/60 bg-black/20 px-5 py-4">
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-fg/90">
                    {preview}
                  </pre>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}
