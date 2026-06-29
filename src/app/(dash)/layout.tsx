import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import Nav from "@/components/nav";
import NotificationBell from "@/components/notification-bell";
import MemberCard from "@/components/auth/member-card";
import { getCurrentMember } from "@/lib/auth";
import type { TeamRole } from "@/lib/constants";

/** App shell: glass sidebar on >=md, collapsing to a top icon-rail under md. */
export default async function DashLayout({ children }: { children: ReactNode }) {
  // Resolve the signed-in member (null when env missing / not provisioned).
  const member = await getCurrentMember();
  const role = (member?.role as TeamRole | undefined) ?? undefined;

  return (
    <div className="min-h-dvh">
      {/* Top bar / icon rail — visible under md only */}
      <header className="glass sticky top-0 z-30 flex items-center justify-between gap-3 rounded-none border-x-0 border-t-0 px-4 py-3 md:hidden">
        <Wordmark />
        <div className="flex items-center gap-1">
          <NotificationBell recipientId={member?.id} />
          <Nav variant="rail" role={role} />
        </div>
      </header>

      {/* Sidebar — visible >=md */}
      <aside className="glass fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 overflow-y-auto rounded-none border-y-0 border-l-0 px-4 py-6 md:flex">
        <Wordmark />
        <Nav variant="sidebar" role={role} />
        <div className="mt-auto flex flex-col gap-2 px-1">
          <MemberCard member={member} />
          <p className="px-1 font-mono text-[10px] uppercase tracking-widest text-muted/70">
            Internal Ops
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="md:pl-64">
        {/* Desktop top bar with notification bell */}
        <div className="sticky top-0 z-20 hidden items-center justify-end gap-2 border-b border-border/50 bg-bg/60 px-4 py-2 backdrop-blur-bento md:flex lg:px-8">
          <NotificationBell recipientId={member?.id} />
        </div>
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl border border-primary/40 bg-primary/15">
        <Sparkles className="size-5 text-primary" aria-hidden />
      </span>
      <div className="leading-none">
        <p className="text-base font-bold tracking-tight text-fg">CAK AI</p>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          Ecosystem
        </p>
      </div>
    </div>
  );
}
