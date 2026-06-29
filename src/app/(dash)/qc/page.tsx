import { ShieldCheck, Check, X, CircleDashed } from "lucide-react";
import { loadBrands, loadPipeline } from "@/lib/dash-data";
import type { QCReport } from "@/lib/types";
import PageHeader from "@/components/page-header";
import BrandSelector from "@/components/brand-selector";
import EmptyState from "@/components/empty-state";
import ScoreRing from "@/components/score-ring";
import QcRunButton from "@/components/qc-run-button";

export const dynamic = "force-dynamic";

interface ChecklistRow {
  label: string;
  value: number | undefined;
}

function checklistRows(report: QCReport | null): ChecklistRow[] {
  return [
    { label: "Hook strength", value: report?.hook_strength },
    { label: "Brand voice match", value: report?.brand_voice_match },
    { label: "Visual quality", value: report?.visual_quality },
  ];
}

// Sub-scores are on a 0-100 scale (see VIDEO_QC_SYSTEM prompt). Pass threshold = 60.
const QC_PASS_THRESHOLD = 60;

function CheckIcon({ value }: { value: number | undefined }) {
  if (value == null) return <CircleDashed className="size-4 text-muted" aria-label="not scored" />;
  if (value >= QC_PASS_THRESHOLD) return <Check className="size-4 text-success" aria-label="pass" />;
  return <X className="size-4 text-danger" aria-label="fail" />;
}

export default async function QcPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const { brands, selected } = await loadBrands(brand);
  const items = selected ? await loadPipeline(selected.id, ["qc_review"]) : [];

  return (
    <>
      <PageHeader
        eyebrow="Quality Control"
        title="QC Queue"
        subtitle="Produced content awaiting AI quality review"
      >
        <BrandSelector
          brands={brands.map((b) => ({ id: b.id, slug: b.slug, name: b.name }))}
          selected={selected?.slug}
        />
      </PageHeader>

      {!selected ? (
        <EmptyState
          icon={ShieldCheck}
          title="No brands configured"
          hint="Add a brand to review its QC queue. The database may be empty or environment variables are not set."
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="QC queue is clear"
          hint="Items appear here once produced content reaches the QC review stage."
        />
      ) : (
        <div className="animate-fade-up grid grid-cols-1 gap-5 lg:grid-cols-2">
          {items.map((item, idx) => {
            const title = item.content_direction?.title ?? "Untitled item";
            const report = item.qc_report;
            const summary =
              item.script?.text?.slice(0, 220) ??
              item.content_direction?.research_notes ??
              "No script summary available.";
            const videoDescription =
              item.content_direction?.title ?? item.script?.text?.slice(0, 200) ?? title;

            return (
              <article
                key={item.id}
                className="glass glass-hover animate-fade-up flex flex-col gap-4 p-5 transition-transform duration-200 hover:-translate-y-0.5"
                style={{ animationDelay: `${Math.min(idx, 8) * 50}ms` }}
              >
                <header className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display truncate text-base font-semibold text-fg">{title}</h2>
                    <p className="mt-1 line-clamp-3 text-sm text-muted">{summary}</p>
                  </div>
                  {report && <ScoreRing score={report.score} />}
                </header>

                <ul className="flex flex-col gap-2 border-t border-border/60 pt-3">
                  {checklistRows(report).map((row) => (
                    <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 text-fg/90">
                        <CheckIcon value={row.value} />
                        {row.label}
                      </span>
                      <span className="tnum text-xs text-muted">
                        {row.value == null ? "—" : `${Math.round(row.value)}/100`}
                      </span>
                    </li>
                  ))}
                </ul>

                {report?.issues && report.issues.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {report.issues.slice(0, 4).map((issue) => (
                      <span
                        key={issue}
                        className="chip border-warning/40 bg-warning/15 text-warning shadow-[0_0_14px_-3px] shadow-warning/40"
                      >
                        {issue}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-auto pt-1">
                  <QcRunButton pipelineId={item.id} videoDescription={videoDescription} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
