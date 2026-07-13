import { PenLine } from "lucide-react";
import { admin } from "@/lib/supabase";
import { loadBrands } from "@/lib/dash-data";
import PageHeader from "@/components/page-header";
import BrandSelector from "@/components/brand-selector";
import EmptyState from "@/components/empty-state";
import ScriptStudio from "@/components/studio/scriptwriter/script-studio";

export const dynamic = "force-dynamic";

async function loadPersonas(brandId: string) {
  try {
    const { data } = await admin().from("personas").select("id, name").eq("brand_id", brandId).order("name", { ascending: true });
    return (data ?? []) as { id: string; name: string }[];
  } catch { return []; }
}

async function loadBatches(brandId: string) {
  try {
    const { data } = await admin().from("sw_batches").select("id, name, external_doc_ref, created_at").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(50);
    return (data ?? []) as { id: string; name: string; external_doc_ref: unknown; created_at: string }[];
  } catch { return []; }
}

export default async function ScriptStudioPage({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const { brand } = await searchParams;
  const { brands, selected } = await loadBrands(brand);
  const [personas, batches] = selected ? await Promise.all([loadPersonas(selected.id), loadBatches(selected.id)]) : [[], []];

  return (
    <>
      <PageHeader eyebrow="Studio" title="Script Writer Studio" subtitle="Import a content plan, fan out naskah per persona, triage with live QC — powered by CAKGPT.">
        <BrandSelector brands={brands.map((b) => ({ id: b.id, slug: b.slug, name: b.name }))} selected={selected?.slug} />
      </PageHeader>

      {!selected ? (
        <div className="animate-fade-up">
          <EmptyState icon={PenLine} title="No brands configured" hint="Add a brand to start writing scripts." />
        </div>
      ) : (
        <div className="animate-fade-up">
          <ScriptStudio brandId={selected.id} personas={personas} batches={batches} />
        </div>
      )}
    </>
  );
}
