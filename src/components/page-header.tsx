import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Tiny uppercase tag above the title. */
  eyebrow?: string;
  /** Right-aligned actions (brand selector, run buttons, etc). */
  children?: ReactNode;
}

/** Page title block: eyebrow + display heading + right-aligned action slot. */
export default function PageHeader({ title, subtitle, eyebrow, children }: PageHeaderProps) {
  return (
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <span className="eyebrow mb-3">{eyebrow}</span>}
        <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-tight text-gradient sm:text-4xl">
          {title}
        </h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
