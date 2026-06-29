import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import Nav from "@/components/nav";
import NotificationBell from "@/components/notification-bell";
import MemberCard from "@/components/auth/member-card";
import { getCurrentMember } from "@/lib/auth";
import type { TeamRole } from "@/lib/constants";

/** App shell: floating glass sidebar on >=md, collapsing to a top icon-rail under md. */
export default async function DashLayout({ children }: { children: ReactNode }) {
  const member = await getCurrentMember();
  const role = (member?.role as TeamRole | undefined) ?? undefined;

  return (
    <div className="min-h-dvh">
      {/* Mobile top bar / icon rail */}
      <header className="glass sticky top-0 z-30 flex items-center justify-between gap-3 rounded-none border-x-0 border-t-0 px-4 py-3 md:hidden">
        <Wordmark />
        <div className="flex items-center gap-1">
          <NotificationBell recipientId={member?.id} />
          <Nav variant="rail" role={role} />
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[17rem] p-3 md:flex">
        <div className="glass flex w-full flex-col gap-6 overflow-y-auto px-3 py-5">
          <div className="px-2">
            <Wordmark />
          </div>
          <Nav variant="sidebar" role={role} />
          <div className="mt-auto flex flex-col gap-3">
            <MemberCard member={member} />
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="md:pl-[17rem]">
        <div className="sticky top-0 z-20 hidden items-center justify-between gap-3 px-6 py-3 md:flex lg:px-10">
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted/60">
            Internal Ops Platform
          </span>
          <NotificationBell recipientId={member?.id} />
        </div>
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</div>
      </main>
    </div>
  );
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="glow-primary grid size-9 place-items-center rounded-xl bg-primary/15">
        <Sparkles className="size-5 text-primary" aria-hidden strokeWidth={1.75} />
      </span>
      <div className="leading-none">
        <p className="font-display text-base font-bold tracking-tight text-fg">CAK AI</p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.24em] text-muted">
          Ecosystem
        </p>
      </div>
    </div>
  );
}
