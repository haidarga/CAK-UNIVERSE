'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, ChevronsUpDown } from 'lucide-react'

// Sidebar workspace switcher. Selecting a client writes the active_client cookie
// and refreshes so every server page re-queries scoped to it. 'all' clears it.
export function ClientSwitcher({ initialClient }: { initialClient?: string | null }) {
  const router = useRouter()
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([])
  // Seed from the server-provided value so the correct workspace shows on first
  // paint (no flash of "All clients"), then load the client list for the labels.
  const [active, setActive] = useState(initialClient || 'all')

  useEffect(() => {
    fetch('/api/scriptwriter/clients').then((r) => r.json()).then((d) => { if (d.ok) setClients(d.clients || []) }).catch(() => {})
  }, [])

  function onChange(value: string) {
    setActive(value)
    document.cookie = `active_client=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }

  return (
    <div className="relative">
      <Building2 size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-mutedText" aria-hidden />
      <ChevronsUpDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-mutedText" aria-hidden />
      <select
        aria-label="Active client workspace"
        value={active}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-surface py-2 pl-8 pr-7 text-sm font-medium text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="all">All clients</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  )
}
