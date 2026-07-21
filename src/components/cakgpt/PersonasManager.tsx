'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, Check, X } from 'lucide-react'

type Persona = {
  id: string
  name: string
  cluster: string | null
  banned_words: string[] | null
  required_words: string[] | null
  tone: Record<string, unknown> | null
}

export function PersonasManager({ personas }: { personas: Persona[] }) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [cluster, setCluster] = useState('')
  const [banned, setBanned] = useState('')
  const [required, setRequired] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  function startEdit(p: Persona) {
    setEditingId(p.id); setName(p.name); setCluster(p.cluster || '')
    setBanned((p.banned_words || []).join(', '))
    setRequired((p.required_words || []).join(', '))
  }

  const csv = (s: string) => s.split(',').map((w) => w.trim()).filter(Boolean)

  async function save(id: string) {
    if (!name.trim()) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/scriptwriter/personas/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), cluster: cluster.trim() || null, banned_words: csv(banned), required_words: csv(required) }),
      })
      if ((await res.json()).ok) { setEditingId(null); router.refresh() }
    } finally { setBusyId(null) }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this persona? (existing naskah keep their snapshot)')) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/scriptwriter/personas/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: false }),
      })
      if ((await res.json()).ok) router.refresh()
    } finally { setBusyId(null) }
  }

  return (
    <div className="space-y-3">
      {personas.map((p) => {
        const editing = editingId === p.id
        return (
          <div key={p.id} className="rounded-lg border border-border bg-surface p-4">
            {editing ? (
              <div className="space-y-2">
                <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Persona name"
                  className="w-full rounded-md border border-primary bg-background px-2.5 py-1.5 text-sm font-medium text-text focus:outline-none focus:ring-1 focus:ring-ring" />
                <div>
                  <label className="mb-0.5 block text-[11px] font-medium text-mutedText">Cluster (audience segment)</label>
                  <input value={cluster} onChange={(e) => setCluster(e.target.value)} placeholder="e.g. Nutrition Mom" aria-label="Persona cluster"
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="mb-0.5 block text-[11px] font-medium text-mutedText">Banned words (comma separated)</label>
                  <input value={banned} onChange={(e) => setBanned(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="mb-0.5 block text-[11px] font-medium text-mutedText">Required words (comma separated)</label>
                  <input value={required} onChange={(e) => setRequired(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => save(p.id)} disabled={busyId === p.id} className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-onPrimary hover:opacity-90 disabled:opacity-50 cursor-pointer"><Check size={14} /> Save</button>
                  <button onClick={() => setEditingId(null)} className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-muted cursor-pointer"><X size={14} /> Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium text-text">{p.name}</h2>
                    {p.cluster && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{p.cluster}</span>
                    )}
                    <span className="font-data text-xs text-mutedText">{(p.banned_words || []).length} banned · {(p.required_words || []).length} required</span>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <button onClick={() => startEdit(p)} aria-label="Edit persona" className="rounded p-1.5 text-mutedText hover:bg-muted hover:text-text cursor-pointer"><Pencil size={14} /></button>
                    <button onClick={() => remove(p.id)} disabled={busyId === p.id} aria-label="Delete persona" className="rounded p-1.5 text-mutedText hover:bg-destructive/10 hover:text-destructive cursor-pointer"><Trash2 size={14} /></button>
                  </div>
                </div>
                {p.tone && Object.keys(p.tone).length > 0 && (
                  <p className="mt-1.5 line-clamp-2 text-sm text-mutedText">
                    {Object.entries(p.tone).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ')}
                  </p>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
