'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, Users, FileText, Lightbulb, Settings, ArrowLeft, Building2, TrendingUp, Wand2, Radar } from 'lucide-react'
import { ClientSwitcher } from '@/components/cakgpt/ClientSwitcher'

const ROOT = '/studio/script'
const NAV_ITEMS = [
  { href: ROOT, label: 'Batches', icon: LayoutGrid },
  { href: `${ROOT}/clients`, label: 'Clients', icon: Building2 },
  { href: `${ROOT}/personas`, label: 'Personas', icon: Users },
  { href: `${ROOT}/briefs`, label: 'Briefs', icon: FileText },
  { href: `${ROOT}/trends`, label: 'Trend Radar', icon: TrendingUp },
  { href: `${ROOT}/strategist`, label: 'Strategist', icon: Radar },
  { href: `${ROOT}/translator`, label: 'Content Translator', icon: Wand2 },
  { href: `${ROOT}/ideas`, label: 'Ideas', icon: Lightbulb },
  { href: `${ROOT}/settings`, label: 'Settings', icon: Settings },
]

export function NavShell({ children, initialClient }: { children: React.ReactNode; initialClient?: string | null }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-dvh">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary font-data text-sm font-bold text-onPrimary">C</span>
          <span className="font-data text-base font-semibold tracking-tight text-text">CAKETING</span>
        </div>

        <div className="px-3 pb-3">
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-mutedText">Workspace</p>
          <ClientSwitcher initialClient={initialClient} />
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {NAV_ITEMS.map((item) => {
            const active = item.href === ROOT ? pathname === ROOT : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-mutedText hover:bg-muted hover:text-text'
                }`}
              >
                {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" aria-hidden />}
                <Icon size={18} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-border p-3">
          {/* Hard navigation (<a>, not next/link): the ecosystem lives in a
              separate route-group shell with a different root layout. Soft
              navigating between the two disjoint layout trees is what broke
              re-entry ("can't reopen studio"); a full load remounts cleanly. */}
          <a
            href="/accounts"
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-mutedText hover:bg-muted hover:text-text"
          >
            <ArrowLeft size={18} strokeWidth={1.75} aria-hidden />
            Back to Ecosystem
          </a>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
