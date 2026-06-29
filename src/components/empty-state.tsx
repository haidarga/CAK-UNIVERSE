import type { ComponentType, ReactNode } from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean; strokeWidth?: number }>;
  title: string;
  hint?: string;
  /** Optional action (button/link) rendered under the hint. */
  action?: ReactNode;
}

/**
 * Considered no-data state — a glowing icon orb on a double-bezel glass plate.
 * Intentional and premium, not a dead empty card.
 */
export default function EmptyState({ icon: Icon = Inbox, title, hint, action }: EmptyStateProps) {
  return (
    <div className="bezel animate-fade-up">
      <div className="glass relative flex flex-col items-center justify-center gap-4 overflow-hidden px-6 py-20 text-center">
        {/* soft radial glow behind the orb */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgb(var(--primary) / 0.22), transparent 70%)",
          }}
        />
        <span className="relative grid size-16 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]">
          <span
            aria-hidden
            className="absolute inset-0 rounded-2xl"
            style={{ boxShadow: "0 0 36px -6px rgb(var(--primary) / 0.55)" }}
          />
          <Icon className="size-7 text-fg/80" aria-hidden strokeWidth={1.5} />
        </span>
        <div className="relative flex flex-col items-center gap-2">
          <h3 className="font-display text-lg font-semibold text-fg">{title}</h3>
          {hint && <p className="max-w-md text-sm leading-relaxed text-muted">{hint}</p>}
        </div>
        {action && <div className="relative mt-1">{action}</div>}
      </div>
    </div>
  );
}
