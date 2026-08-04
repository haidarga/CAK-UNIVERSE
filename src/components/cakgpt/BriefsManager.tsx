'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Pencil, Trash2, Check, X, CheckSquare, Square, Zap } from 'lucide-react'
import { ExecuteBriefsPanel } from '@/components/cakgpt/ExecuteBriefsPanel'

type Brief = {
  id: string
  title: string
  status: string
  client_id: string | null
  import_group: string | null
  product: string | null
  platform: string | null
  fields: Record<string, unknown> | null
  persona_id: string | null
}

const UNGROUPED = 'Ungrouped'

export function BriefsManager({ briefs, clientNames, personaNames, personas, activeClientId }: {
  briefs: Brief[]
  clientNames: Record<string, string>
  personaNames: Record<string, string>
  personas: Array<{ id: string; name: string; cluster?: string | null }>
  activeClientId: string | null
}) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  // Selection for Execute. Only 'ready' briefs are selectable — a draft has not
  // been handed off yet and an archived one is soft-deleted.
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [executing, setExecuting] = useState(false)

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleGroup(items: Brief[]) {
    const ids = items.filter((b) => b.status === 'ready').map((b) => b.id)
    const allOn = ids.length > 0 && ids.every((id) => selectedIds.includes(id))
    setSelectedIds((prev) => (allOn ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]))
  }

  // Group by content plan; preserve insertion order of groups.
  const groups: Array<{ name: string; items: Brief[] }> = []
  const index = new Map<string, number>()
  for (const b of briefs) {
    const g = b.import_group || UNGROUPED
    if (!index.has(g)) { index.set(g, groups.length); groups.push({ name: g, items: [] }) }
    groups[index.get(g)!].items.push(b)
  }

  async function saveTitle(id: string) {
    if (!editTitle.trim()) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/scriptwriter/briefs/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: editTitle.trim() }),
      })
      if ((await res.json()).ok) { setEditingId(null); router.refresh() }
    } finally { setBusyId(null) }
  }

  async function removeBrief(id: string) {
    if (!window.confirm('Delete this brief? (it will be archived and hidden)')) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/scriptwriter/briefs/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'archived' }),
      })
      if ((await res.json()).ok) router.refresh()
    } finally { setBusyId(null) }
  }

  if (briefs.length === 0) return null

  return (
    <div className="space-y-3">
      {/* Sticky so the action stays reachable while scrolling a 40-brief plan. */}
      {selectedIds.length > 0 && !executing && (
        <div className="sticky top-2 z-10 flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-surface px-3 py-2 shadow-sm">
          <span className="text-xs font-medium text-text">{selectedIds.length} brief dipilih</span>
          <div className="flex gap-1.5">
            <button onClick={() => setSelectedIds([])}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text hover:bg-muted cursor-pointer">
              Batal
            </button>
            <button onClick={() => setExecuting(true)}
              className="flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-onPrimary hover:opacity-90 cursor-pointer">
              <Zap size={13} aria-hidden /> Execute {selectedIds.length} brief
            </button>
          </div>
        </div>
      )}

      {executing && (
        <ExecuteBriefsPanel
          briefIds={selectedIds}
          personas={personas}
          clientId={activeClientId}
          onClose={() => setExecuting(false)}
        />
      )}

      {groups.map((group) => {
        const isCollapsed = collapsed[group.name]
        return (
          <div key={group.name} className="overflow-hidden rounded-lg border border-border bg-surface">
            <button onClick={() => setCollapsed((c) => ({ ...c, [group.name]: !c[group.name] }))}
              aria-expanded={!isCollapsed}
              className="flex w-full items-center gap-2 bg-muted/40 px-4 py-2.5 text-left hover:bg-muted/60 cursor-pointer">
              <ChevronDown size={15} className={`text-mutedText transition-transform ${isCollapsed ? '-rotate-90' : ''}`} aria-hidden />
              <span className="text-sm font-semibold text-text">{group.name}</span>
              <span className="rounded-full bg-background px-2 py-0.5 font-data text-[11px] font-medium text-mutedText">{group.items.length}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); toggleGroup(group.items) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleGroup(group.items) } }}
                className="ml-auto rounded px-2 py-0.5 text-[11px] font-medium text-mutedText hover:bg-background hover:text-text cursor-pointer"
              >
                Pilih semua
              </span>
            </button>

            {!isCollapsed && (
              <div className="divide-y divide-border">
                {group.items.map((b) => {
                  const editing = editingId === b.id
                  const fields = (b.fields || {}) as Record<string, unknown>
                  return (
                    <div key={b.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        {!editing && (
                          <button
                            onClick={() => toggle(b.id)}
                            disabled={b.status !== 'ready'}
                            aria-label={`Pilih ${b.title}`}
                            aria-pressed={selectedIds.includes(b.id)}
                            title={b.status === 'ready' ? undefined : `Cuma brief "ready" yang bisa di-generate (ini: ${b.status})`}
                            className="mt-0.5 shrink-0 text-mutedText hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                          >
                            {selectedIds.includes(b.id)
                              ? <CheckSquare size={15} className="text-primary" aria-hidden />
                              : <Square size={15} aria-hidden />}
                          </button>
                        )}
                        <div className="min-w-0 flex-1">
                          {editing ? (
                            <div className="flex items-center gap-1.5">
                              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(b.id); if (e.key === 'Escape') setEditingId(null) }}
                                className="w-full rounded-md border border-primary bg-background px-2 py-1 text-sm font-medium text-text focus:outline-none focus:ring-1 focus:ring-ring" />
                              <button onClick={() => saveTitle(b.id)} disabled={busyId === b.id} aria-label="Save" className="rounded p-1 text-primary hover:bg-primary/10 cursor-pointer"><Check size={15} /></button>
                              <button onClick={() => setEditingId(null)} aria-label="Cancel" className="rounded p-1 text-mutedText hover:bg-muted cursor-pointer"><X size={15} /></button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate font-medium text-text">{b.title}</h3>
                              {b.client_id && clientNames[b.client_id] && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">{clientNames[b.client_id]}</span>}
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-mutedText">{b.status}</span>
                            </div>
                          )}
                          {!editing && (
                            <>
                              <p className="mt-0.5 text-xs text-mutedText">
                                {[b.product, b.platform, b.persona_id ? personaNames[b.persona_id] : null].filter(Boolean).join(' · ') || '—'}
                              </p>
                              {Object.keys(fields).length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {Object.entries(fields).slice(0, 6).map(([k, v]) => (
                                    <span key={k} className="rounded bg-muted px-1.5 py-0.5 font-data text-[10px] text-mutedText"><span className="font-medium text-text">{k}:</span> {String(v)}</span>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                        {!editing && (
                          <div className="flex shrink-0 gap-0.5">
                            <button onClick={() => { setEditingId(b.id); setEditTitle(b.title) }} aria-label="Edit title" className="rounded p-1.5 text-mutedText hover:bg-muted hover:text-text cursor-pointer"><Pencil size={14} /></button>
                            <button onClick={() => removeBrief(b.id)} disabled={busyId === b.id} aria-label="Delete brief" className="rounded p-1.5 text-mutedText hover:bg-destructive/10 hover:text-destructive cursor-pointer"><Trash2 size={14} /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
