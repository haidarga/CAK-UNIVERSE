import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: ReactNode;
  /** Tailwind col/row span classes for bento layout, e.g. "lg:col-span-2 lg:row-span-2". */
  span?: string;
  title?: string;
  /** lucide icon component for the title. */
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Right-aligned action slot in the header. */
  action?: ReactNode;
  className?: string;
  /** Disable hover lift (e.g. for static info tiles). */
  noHover?: boolean;
}

/** Frosted bento card. Wraps content in `.glass` with an optional header. */
export default function GlassCard({
  children,
  span,
  title,
  icon: Icon,
  action,
  className,
  noHover = false,
}: GlassCardProps) {
  const hasHeader = Boolean(title || action);
  return (
    <section className={cn("glass animate-fade-up p-5", !noHover && "glass-hover", span, className)}>
      {hasHeader && (
        <header className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="size-4 shrink-0 text-muted" aria-hidden />}
            {title && (
              <h2 className="truncate font-mono text-[11px] font-medium uppercase tracking-widest text-muted">
                {title}
              </h2>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
