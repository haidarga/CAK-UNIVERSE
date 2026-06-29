import { PenLine } from "lucide-react";
import { admin } from "@/lib/supabase";
import { loadBrands, loadPipeline } from "@/lib/dash-data";
import type { Persona, Hook, EmbeddedResource } from "@/lib/types";
import PageHeader from "@/components/page-header";
import BrandSelector from "@/components/brand-selector";
import EmptyState from "@/components/empty-state";
import ScriptEditor from "@/components/studio/script-editor";

export const dynamic = "force-dynamic";

const SCRIPT_STAGES = ["scripted", "script_reviewed", "guardrail_review"];

async function loadPersonas(brandId: string): Promise<Persona[]> {
  try {
    const { data, error } = await admin()
      .from("personas")
      .select("*")
      .eq("brand_id", brandId)
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Persona[];
  } catch {
    return [];
  }
}

async function loadHooks(brandId: string): Promise<Hook[]> {
  try {
    const { data, error } = await admin()
      .from("hooks")
      .select("*")
      .eq("brand_id", brandId)
      .order("performance_score", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Hook[];
  } catch {
    return [];
  }
}

async function loadEmbeds(brandId: string): Promise<EmbeddedResource[]> {
  try {
    const { data, error } = await admin()
      .from("embedded_resources")
      .select("*")
      .eq("brand_id", brandId)
      .eq("kind", "doc")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as EmbeddedResource[];
  } catch {
    return [];
  }
}

export default async function ScriptStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const { brands, selected } = await loadBrands(brand);

  const [personas, hooks, embeds, items] = selected
    ? await Promise.all([
        loadPersonas(selected.id),
        loadHooks(selected.id),
        loadEmbeds(selected.id),
        loadPipeline(selected.id, SCRIPT_STAGES),
      ])
    : [[], [], [], []];

  return (
    <>
      <PageHeader
        title="Script Writer Studio"
        subtitle="Draft scripts with inline AI and live guardrail checks"
      >
        <BrandSelector
          brands={brands.map((b) => ({ id: b.id, slug: b.slug, name: b.name }))}
          selected={selected?.slug}
        />
      </PageHeader>

      {!selected ? (
        <EmptyState
          icon={PenLine}
          title="No brands configured"
          hint="Add a brand to start writing scripts. The database may be empty or environment variables are not set."
        />
      ) : (
        <ScriptEditor
          brand={selected}
          personas={personas}
          hooks={hooks}
          embeds={embeds}
          items={items}
        />
      )}
    </>
  );
}
