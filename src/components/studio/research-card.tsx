"use client";

import { Music2, Instagram, Youtube, TrendingUp, ExternalLink, Compass } from "lucide-react";
import type { ComponentType } from "react";
import { fmtCompact } from "@/lib/utils";

export type ResearchPlatform = "tiktok" | "instagram" | "youtube" | "sge";

export interface ResearchCardItem {
  platform: ResearchPlatform;
  url: string;
  title?: string;
  thumbnail?: string;
  views?: number;
  likes?: number;
  engagementRate?: number;
  score: number;
}

interface PlatformMeta {
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean; strokeWidth?: number }>;
  chip: string;
}

const PLATFORM_META: Record<ResearchPlatform, PlatformMeta> = {
  tiktok: { label: "TikTok", icon: Music2, chip: "border-fg/20 bg-fg/10 text-fg" },
  instagram: {
    label: "Instagram",
    icon: Instagram,
    chip: "border-accent/30 bg-accent/10 text-accent",
  },
  youtube: { label: "YouTube", icon: Youtube, chip: "border-danger/30 bg-danger/10 text-danger" },
  sge: { label: "SGE", icon: TrendingUp, chip: "border-success/30 bg-success/10 text-success" },
};

interface ResearchCardProps {
  item: ResearchCardItem;
  /** Turn a researched item into a content direction (strategy seed). */
  onUse: (item: ResearchCardItem) => void;
}

/** A single viral/trending result card. */
export default function ResearchCard({ item, onUse }: ResearchCardProps) {
  const meta = PLATFORM_META[item.platform];
  const Icon = meta.icon;
  const engagementPct =
    item.engagementRate != null ? `${(item.engagementRate * 100).toFixed(1)}%` : null;

  return (
    <article className="glass glass-hover flex flex-col overflow-hidden p-0">
      {item.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- external CDN thumbs, dimensions vary
        <img
          src={item.thumbnail}
          alt={item.title ?? `${meta.label} viral content`}
          loading="lazy"
          className="aspect-video w-full bg-surface-2 object-cover"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-surface-2">
          <Icon className="size-7 text-muted/50" aria-hidden strokeWidth={1.5} />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className={`chip inline-flex items-center gap-1 ${meta.chip}`}>
            <Icon className="size-3" aria-hidden strokeWidth={1.5} />
            {meta.label}
          </span>
          {engagementPct && (
            <span className="tnum text-[11px] text-muted" title="Engagement rate">
              {engagementPct} eng
            </span>
          )}
        </div>

        {item.title && (
          <p className="line-clamp-2 text-sm font-medium leading-snug text-fg">{item.title}</p>
        )}

        <div className="mt-auto flex items-center gap-3 text-[11px] text-muted">
          {item.views != null && (
            <span className="tnum">{fmtCompact(item.views)} views</span>
          )}
          {item.likes != null && (
            <span className="tnum">{fmtCompact(item.likes)} likes</span>
          )}
        </div>

        <div className="flex items-center gap-2 pt-0.5">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="chip inline-flex items-center gap-1 border-border bg-surface-2/60 text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            aria-label={`Buka konten di ${meta.label}`}
          >
            <ExternalLink className="size-3" aria-hidden strokeWidth={1.5} />
            Buka
          </a>
          <button
            type="button"
            onClick={() => onUse(item)}
            className="chip inline-flex items-center gap-1 border-accent/30 bg-accent/10 text-accent transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <Compass className="size-3" aria-hidden strokeWidth={1.5} />
            Jadikan arah konten
          </button>
        </div>
      </div>
    </article>
  );
}
