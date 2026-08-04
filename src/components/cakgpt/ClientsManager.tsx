'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, Check, X, Wand2, Loader2 } from 'lucide-react'
import { BrandContextEditor } from '@/components/cakgpt/BrandContextEditor'
import { PakemManager } from '@/components/cakgpt/PakemManager'
import {
  EMPTY_BRAND_CONTEXT,
  isBrandContextEmpty,
  parseBrandContext,
  type BrandContext,
} from '@/lib/cakgpt/brand-context'

type Client = { id: string; name: string; notes: string | null; brand_context?: unknown }

export function ClientsManager({ clients, briefCounts }: {
  clients: Client[]
  briefCounts: Record<string, number>
}) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [brandContext, setBrandContext] = useState<BrandContext>(EMPTY_BRAND_CONTEXT)
  const [busyId, setBusyId] = useState<string | null>(null)

  function startEdit(c: Client) {
    setEditingId(c.id); setName(c.name); setNotes(c.notes || '')
    // Falls back to blanks for a client row created before migration 020.
    setBrandContext(parseBrandContext(c.brand_context) || EMPTY_BRAND_CONTEXT)
  }

  async function save(id: string) {
    if (!name.trim()) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/scriptwriter/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          notes: notes || null,
          brand_context: isBrandContextEmpty(brandContext) ? {} : brandContext,
        }),
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
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} aria-label="Client notes" placeholder="Catatan bebas — tidak dibaca AI"
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />

                {/* Old free-text notes predate the structured fields and are the
                    likeliest place a brand rule is already written down — offer
                    to split them instead of making the writer retype it. */}
                {notes.trim() && isBrandContextEmpty(brandContext) && (
                  <SplitNotesButton notes={notes} brandName={name} onSplit={setBrandContext} />
                )}

                <div className="border-t border-border pt-3">
                  <BrandContextEditor brandName={name} value={brandContext} onChange={setBrandContext} />
                </div>

                {/* Pakem rows FK to the client, so this is edit-only — a brand
                    being created has no id to attach them to yet. */}
                <div className="border-t border-border pt-3">
                  <PakemManager clientId={c.id} clientName={c.name} />
                </div>

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

// One-click migration of a legacy free-text note into the structured fields.
// Deliberately a PROPOSAL: it fills the editor, and nothing is written until
// the writer reviews it and hits Save — the original note is left untouched
// either way, so a bad split costs nothing.
function SplitNotesButton({ notes, brandName, onSplit }: {
  notes: string
  brandName: string
  onSplit: (ctx: BrandContext) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/scriptwriter/clients/extract-context', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'text', text: notes, brand_name: brandName }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error || 'gagal merapikan notes'); return }
      if (data.empty) { setError('AI gak nemu info brand yang kepake di notes ini.'); return }
      onSplit(data.context)
    } catch {
      setError('network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button type="button" onClick={run} disabled={busy}
        className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50 cursor-pointer">
        {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Wand2 size={13} aria-hidden />}
        {busy ? 'AI lagi mecah notes…' : 'Rapikan notes lama jadi 9 field'}
      </button>
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
