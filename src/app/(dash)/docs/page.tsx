import PageHeader from "@/components/page-header";
import DocSyncWorkspace from "@/components/docs/doc-sync-workspace";

export const dynamic = "force-dynamic";

export default function DocsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Setup"
        title="Documents"
        subtitle="Link Google Doc / Sheet → liat & edit seluruh isinya di sini, sync near-realtime dua arah"
      />
      <div className="animate-fade-up">
        <DocSyncWorkspace />
      </div>
    </>
  );
}
