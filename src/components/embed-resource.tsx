import {
  FileText,
  Sheet,
  HardDrive,
  Video,
  Send,
  User,
  KanbanSquare,
  ExternalLink,
  Link2,
  Paperclip,
  type LucideIcon,
} from "lucide-react";
import EmptyState from "@/components/empty-state";
import type { EmbeddedResource } from "@/lib/types";

// kind -> icon. Falls back to a generic link glyph.
const KIND_ICON: Record<EmbeddedResource["kind"], LucideIcon> = {
  doc: FileText,
  sheet: Sheet,
  drive_file: HardDrive,
  video: Video,
  post: Send,
  profile: User,
  board: KanbanSquare,
};

// provider -> icon. Generic providers map to a sensible default; unknown -> Link2.
const PROVIDER_ICON: Record<string, LucideIcon> = {
  google_drive: HardDrive,
  google_docs: FileText,
  google_sheets: Sheet,
  drive: HardDrive,
  docs: FileText,
  sheets: Sheet,
  youtube: Video,
  tiktok: Video,
  instagram: User,
  telegram: Send,
  trello: KanbanSquare,
  notion: FileText,
};

function providerIcon(provider: string): LucideIcon {
  return PROVIDER_ICON[provider.toLowerCase()] ?? Link2;
}

function prettyProvider(provider: string): string {
  return provider.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A single attached external resource rendered as a glass card. */
export function EmbedResource({ resource }: { resource: EmbeddedResource }) {
  const ProviderIcon = providerIcon(resource.provider);
  const title = resource.title?.trim() || resource.external_url;

  return (
    <div className="glass glass-hover flex flex-col gap-3 p-3.5 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-start gap-2.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border/60 bg-surface-2/60 text-primary">
          <ProviderIcon className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg" title={title}>
            {title}
          </p>
          <span className="chip mt-1 border-border bg-surface-2/40 capitalize text-muted">
            {KindLabel(resource.kind)}
          </span>
        </div>
      </div>

      {resource.thumbnail_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resource.thumbnail_url}
          alt=""
          loading="lazy"
          className="h-28 w-full rounded-xl border border-border/50 object-cover ring-1 ring-inset ring-white/5"
        />
      )}

      <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-2.5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted/70">
          {prettyProvider(resource.provider)}
        </span>
        <a
          href={resource.external_url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${title} in a new tab`}
          className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-primary outline-none transition-colors hover:gap-1.5 hover:underline focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          Open
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
    </div>
  );
}

function KindLabel(kind: EmbeddedResource["kind"]) {
  const Icon = KIND_ICON[kind] ?? Link2;
  return (
    <>
      <Icon className="size-3" aria-hidden />
      {kind.replace(/_/g, " ")}
    </>
  );
}

interface EmbedListProps {
  resources: EmbeddedResource[];
  /** Optional "+ Attach" affordance. */
  onAdd?: () => void;
}

/** Grid of embedded resources with an optional attach button + empty state. */
export function EmbedList({ resources, onAdd }: EmbedListProps) {
  if (resources.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState
          icon={Paperclip}
          title="No linked resources"
          hint="Attach Google Docs, Sheets, Drive files, videos, or posts to keep everything in one place."
        />
        {onAdd && (
          <div className="flex justify-center">
            <AttachButton onAdd={onAdd} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {resources.map((r) => (
          <EmbedResource key={r.id} resource={r} />
        ))}
      </div>
      {onAdd && <AttachButton onAdd={onAdd} />}
    </div>
  );
}

function AttachButton({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="inline-flex min-h-[40px] w-fit cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3.5 py-2 text-sm font-medium text-muted outline-none transition-colors duration-200 hover:border-primary/40 hover:text-fg focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <Paperclip className="size-4" aria-hidden />
      Attach
    </button>
  );
}
