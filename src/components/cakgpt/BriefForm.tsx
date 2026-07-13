'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'

type FieldRow = { id: string; key: string; value: string }

export function BriefForm({ personas, clients }: {
  personas: Array<{ id: string; name: string }>
  clients: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [product, setProduct] = useState('')
  const [platform, setPlatform] = useState('')
  const [personaId, setPersonaId] = useState('')
  const [clientId, setClientId] = useState('')
  const nextFieldId = useRef(1)
  const [fields, setFields] = useState<FieldRow[]>([{ id: 'field-0', key: '', value: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('Title is required')
    setSaving(true)
    setError(null)

    const fieldsObj = Object.fromEntries(fields.filter((f) => f.key.trim()).map((f) => [f.key.trim(), f.value]))

    try {
      const res = await fetch('/api/scriptwriter/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, product: product || null, platform: platform || null, persona_id: personaId || null, client_id: clientId || null, fields: fieldsObj }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'failed to save')

      setTitle(''); setProduct(''); setPlatform(''); setPersonaId(''); setClientId(''); setFields([{ id: 'field-0', key: '', value: '' }])
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-text">New brief</h2>

      <div>
        <label htmlFor="brief-title" className="mb-1 block text-xs font-medium text-text">Title</label>
        <input id="brief-title" value={title} onChange={(e) => setTitle(e.target.value)} required
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label htmlFor="brief-product" className="mb-1 block text-xs font-medium text-text">Product</label>
          <input id="brief-product" value={product} onChange={(e) => setProduct(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div>
          <label htmlFor="brief-platform" className="mb-1 block text-xs font-medium text-text">Platform</label>
          <input id="brief-platform" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="tiktok, reels, shorts…"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label htmlFor="brief-client" className="mb-1 block text-xs font-medium text-text">Client / brand</label>
          <select id="brief-client" value={clientId} onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="">— none —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="brief-persona" className="mb-1 block text-xs font-medium text-text">Default persona</label>
          <select id="brief-persona" value={personaId} onChange={(e) => setPersonaId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="">— none —</option>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text">
          Brief fields <span className="font-normal text-mutedText">(whatever the strategist brief actually contains — angle, target audience, key message, CTA…)</span>
        </label>
        <div className="space-y-1.5">
          {fields.map((f) => (
            <div key={f.id} className="flex gap-1.5">
              <input value={f.key} placeholder="field name" aria-label="Field name" onChange={(e) => {
                setFields((prev) => prev.map((row) => (row.id === f.id ? { ...row, key: e.target.value } : row)))
              }} className="w-2/5 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
              <input value={f.value} placeholder="value" aria-label="Field value" onChange={(e) => {
                setFields((prev) => prev.map((row) => (row.id === f.id ? { ...row, value: e.target.value } : row)))
              }} className="w-full min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
              <button type="button" aria-label="Remove field" onClick={() => setFields((prev) => prev.filter((row) => row.id !== f.id))}
                className="shrink-0 rounded-md p-1.5 text-mutedText hover:bg-muted hover:text-destructive cursor-pointer">
                <X size={14} aria-hidden />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setFields((prev) => [...prev, { id: `field-${nextFieldId.current++}`, key: '', value: '' }])}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer">
            <Plus size={12} aria-hidden /> Add field
          </button>
        </div>
      </div>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      <button type="submit" disabled={saving}
        className="w-full rounded-md bg-primary py-2 text-sm font-medium text-onPrimary transition-opacity duration-150 hover:opacity-90 disabled:opacity-50 cursor-pointer">
        {saving ? 'Saving…' : 'Save brief'}
      </button>
    </form>
  )
}
