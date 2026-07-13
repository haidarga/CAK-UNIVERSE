'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ClientForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
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
        body: JSON.stringify({ name, notes: notes || null }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'failed to save')
      setName(''); setNotes('')
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
          Notes <span className="font-normal text-mutedText">(brand voice, do's and don'ts, anything the writer should remember)</span>
        </label>
        <textarea id="client-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      <button type="submit" disabled={saving}
        className="w-full rounded-md bg-primary py-2 text-sm font-medium text-onPrimary transition-opacity duration-150 hover:opacity-90 disabled:opacity-50 cursor-pointer">
        {saving ? 'Saving…' : 'Save client'}
      </button>
    </form>
  )
}
