'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

export function DeleteBatchButton({ batchId, batchName, naskahCount }: {
  batchId: string
  batchName: string
  naskahCount: number
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function del() {
    const msg = naskahCount > 0
      ? `Delete "${batchName}" and its ${naskahCount} naskah? This cannot be undone.`
      : `Delete "${batchName}"?`
    if (!window.confirm(msg)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/scriptwriter/batches/${batchId}`, { method: 'DELETE' })
      if ((await res.json()).ok) router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button onClick={del} disabled={busy} aria-label={`Delete batch ${batchName}`}
      className="rounded p-1.5 text-mutedText hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 cursor-pointer">
      <Trash2 size={15} aria-hidden />
    </button>
  )
}
