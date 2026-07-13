'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, Check, X } from 'lucide-react'

type Client = { id: string; name: string; notes: string | null }

export function ClientsManager({ clients, briefCounts }: {
  clients: Client[]
  briefCounts: Record<string, number>
}) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  function startEdit(c: Client) {
    setEditingId(c.id); setName(c.name); setNotes(c.notes || '')
  }

  async function save(id: string) {
    if (!name.trim()) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/scriptwriter/clients/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), notes: notes || null }),
      })
      if ((await res.json()).ok) { setEditingId(null); router.refresh() }
    } finally { setBusyId(null) }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this client? Its briefs/batches stay but lose the brand tag.')) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/scriptwriter/clients/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: false }),
      })
      if ((await res.json()).ok) router.refresh()
    } finally { setBusyId(null) }
  }

  return (
    <div className="space-y-3">
      {clients.map((c) => {
        const editing = editingId === c.id
        return (
          <div key={c.id} className="rounded-lg border border-border bg-surface p-4">
            {editing ? (
              <div className="space-y-2">
                <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Client name"
                  className="w-full rounded-md border border-primary bg-background px-2.5 py-1.5 text-sm font-medium text-text focus:outline-none focus:ring-1 focus:ring-ring" />
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} aria-label="Client notes" placeholder="Notes…"
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
                <div className="flex gap-2">
                  <button onClick={() => save(c.id)} disabled={busyId === c.id} className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-onPrimary hover:opacity-90 disabled:opacity-50 cursor-pointer"><Check size={14} /> Save</button>
                  <button onClick={() => setEditingId(null)} className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-muted cursor-pointer"><X size={14} /> Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium text-text">{c.name}</h2>
                    <span className="rounded bg-muted px-2 py-0.5 font-data text-xs font-medium text-mutedText">{briefCounts[c.id] || 0} briefs</span>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <button onClick={() => startEdit(c)} aria-label="Edit client" className="rounded p-1.5 text-mutedText hover:bg-muted hover:text-text cursor-pointer"><Pencil size={14} /></button>
                    <button onClick={() => remove(c.id)} disabled={busyId === c.id} aria-label="Delete client" className="rounded p-1.5 text-mutedText hover:bg-destructive/10 hover:text-destructive cursor-pointer"><Trash2 size={14} /></button>
                  </div>
                </div>
                {c.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-mutedText">{c.notes}</p>}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
