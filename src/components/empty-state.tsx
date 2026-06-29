import type { ComponentType } from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  hint?: string;
}

/** Centered no-data placeholder inside a glass card. */
export default function EmptyState({ icon: Icon = Inbox, title, hint }: EmptyStateProps) {
  return (
    <div className="glass flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full border border-border/60 bg-surface-2/50">
        <Icon className="size-6 text-muted" aria-hidden />
      </span>
      <h3 className="font-sans text-base font-semibold text-fg">{title}</h3>
      {hint && <p className="max-w-md text-sm text-muted">{hint}</p>}
    </div>
  );
}
