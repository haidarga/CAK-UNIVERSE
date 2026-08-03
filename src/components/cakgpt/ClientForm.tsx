'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrandContextEditor } from '@/components/cakgpt/BrandContextEditor'
import { EMPTY_BRAND_CONTEXT, isBrandContextEmpty, type BrandContext } from '@/lib/cakgpt/brand-context'

export function ClientForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [brandContext, setBrandContext] = useState<BrandContext>(EMPTY_BRAND_CONTEXT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Name is required')
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/scriptwriter/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          notes: notes || null,
          // Sent only when it has content, so a client created without brand
          // rules stores {} rather than nine empty strings.
          brand_context: isBrandContextEmpty(brandContext) ? {} : brandContext,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'failed to save')
      setName(''); setNotes(''); setBrandContext(EMPTY_BRAND_CONTEXT)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-text">New client / brand</h2>

      <div>
        <label htmlFor="client-name" className="mb-1 block text-xs font-medium text-text">Name</label>
        <input id="client-name" value={name} onChange={(e) => setName(e.target.value)} required
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>

      <div>
        <label htmlFor="client-notes" className="mb-1 block text-xs font-medium text-text">
          Notes <span className="font-normal text-mutedText">(catatan bebas buat penulis — TIDAK dibaca AI)</span>
        </label>
        <textarea id="client-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>

      <div className="border-t border-border pt-4">
        <BrandContextEditor brandName={name} value={brandContext} onChange={setBrandContext} />
      </div>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      <button type="submit" disabled={saving}
        className="w-full rounded-md bg-primary py-2 text-sm font-medium text-onPrimary transition-opacity duration-150 hover:opacity-90 disabled:opacity-50 cursor-pointer">
        {saving ? 'Saving…' : 'Save client'}
      </button>
    </form>
  )
}
