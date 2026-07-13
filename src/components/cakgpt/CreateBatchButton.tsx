'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

export function CreateBatchButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createBatch() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/scriptwriter/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'failed to create batch')
      router.push(`/studio/script/batches/${data.batch.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
      <button
        onClick={createBatch}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-onPrimary transition-opacity duration-150 hover:opacity-90 disabled:opacity-50 cursor-pointer"
      >
        <Plus size={16} strokeWidth={2} aria-hidden />
        {loading ? 'Creating…' : 'New batch'}
      </button>
    </div>
  )
}
