"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CheckSquare,
  LayoutDashboard,
  Activity,
  Lightbulb,
  PenLine,
  Clapperboard,
  ShieldCheck,
  Users,
  KanbanSquare,
  FileText,
  BarChart3,
  Plug,
  Bug,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canAccess } from "@/lib/access";
import type { TeamRole } from "@/lib/constants";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Command",
    items: [
      { href: "/tasks", label: "My Tasks", icon: CheckSquare },
      { href: "/team", label: "Team Center", icon: LayoutDashboard },
      { href: "/activity", label: "Activity", icon: Activity },
    ],
  },
  {
    label: "Studios",
    items: [
      { href: "/studio/strategy", label: "Strategy", icon: Lightbulb },
      { href: "/studio/script", label: "Script", icon: PenLine },
      { href: "/studio/creator", label: "Creator", icon: Clapperboard },
      { href: "/studio/qc", label: "QC Station", icon: ShieldCheck },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/accounts", label: "Accounts", icon: Users },
      { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
      { href: "/scripts", label: "Scripts", icon: FileText },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/dev", label: "Dev Board", icon: Bug },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Grouped, active-aware navigation. Renders a labelled vertical list as the
 * sidebar (>=md) and a flat horizontal icon-rail under md.
 *
 * When `role` is provided, items are filtered by the role→route policy.
 * When `role` is undefined (no auth resolved), ALL items show — a safe
 * default that keeps the shell usable in local dev.
 */
export default function Nav({
  variant = "sidebar",
  role,
}: {
  variant?: "sidebar" | "rail";
  role?: TeamRole;
}) {
  const pathname = usePathname();

  const groups = role
    ? NAV_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((item) => canAccess(role, item.href)),
      })).filter((g) => g.items.length > 0)
    : NAV_GROUPS;

  if (variant === "rail") {
    const flat = groups.flatMap((g) => g.items);
    return (
      <nav aria-label="Main navigation" className="flex items-center gap-1 overflow-x-auto">
        {flat.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} rail />
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-3 pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted/70">
            {group.label}
          </p>
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </div>
      ))}
    </nav>
  );
}

function NavLink({ item, active, rail }: { item: NavItem; active: boolean; rail?: boolean }) {
  const { href, label, icon: Icon } = item;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={rail ? label : undefined}
      className={cn(
        "group flex items-center rounded-xl text-sm font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary/60",
        rail ? "size-11 shrink-0 justify-center" : "min-h-[44px] gap-3 px-3",
        active
          ? "border border-primary/40 bg-primary/15 text-fg"
          : "border border-transparent text-muted hover:bg-surface-2/60 hover:text-fg",
      )}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden />
      {!rail && <span className="truncate">{label}</span>}
    </Link>
  );
}
