import { admin } from "@/lib/supabase";
import type { Brand } from "@/lib/types";
import PageHeader from "@/components/page-header";
import BrandManager from "@/components/brands/brand-manager";

export const dynamic = "force-dynamic";

async function loadAllBrands(): Promise<Brand[]> {
  try {
    const { data, error } = await admin()
      .from("brands")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Brand[];
  } catch {
    return [];
  }
}

export default async function BrandsPage() {
  const brands = await loadAllBrands();

  return (
    <>
      <PageHeader
        eyebrow="Setup"
        title="Brands"
        subtitle="Fondasi semua kerjaan — brand, voice, produk & aturan yang dibaca strategist, scriptwriter & AI"
      />
      <div className="animate-fade-up">
        <BrandManager initialBrands={brands} />
      </div>
    </>
  );
}
