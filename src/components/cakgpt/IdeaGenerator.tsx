'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lightbulb, Sparkles } from 'lucide-react'

type Angle = { angle_no: number; hook_slug: string; hook_label: string; one_liner: string; why_it_works: string }

export function IdeaGenerator({ personas, briefs, batches }: {
  personas: Array<{ id: string; name: string }>
  briefs: Array<{ id: string; title: string }>
  batches: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [personaId, setPersonaId] = useState('')
  const [briefId, setBriefId] = useState('')
  const [adHoc, setAdHoc] = useState('')
  const [count, setCount] = useState(8)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ideaSessionId, setIdeaSessionId] = useState<string | null>(null)
  const [angles, setAngles] = useState<Angle[]>([])
  const [batchId, setBatchId] = useState(batches[0]?.id || '')
  const [promoting, setPromoting] = useState<number | null>(null)

  async function generate() {
    if (!briefId && !adHoc.trim()) return setError('Pick a brief or write some ad-hoc context')
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/scriptwriter/ideas/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_id: personaId || undefined, brief_id: briefId || undefined, ad_hoc_context: briefId ? undefined : adHoc, count }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'failed to generate ideas')
      setIdeaSessionId(data.idea_session_id)
      setAngles(data.angles)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error')
    } finally {
      setLoading(false)
    }
  }

  async function promote(angleNo: number) {
    if (!briefId || !batchId) return
    setPromoting(angleNo)
    try {
      const res = await fetch('/api/scriptwriter/naskah/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief_id: briefId, batch_id: batchId, source_idea_session_id: ideaSessionId, source_idea_angle_no: angleNo }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'failed to promote')
      router.push(`/studio/script/batches/${batchId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error')
    } finally {
      setPromoting(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text">Persona <span className="font-normal text-mutedText">(optional)</span></label>
            <select value={personaId} onChange={(e) => setPersonaId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">— none —</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text">Brief <span className="font-normal text-mutedText">(optional)</span></label>
            <select value={briefId} onChange={(e) => setBriefId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">— none, use ad-hoc context —</option>
              {briefs.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text">Count</label>
            <input type="number" min={3} max={12} value={count} onChange={(e) => setCount(parseInt(e.target.value) || 8)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>

        {!briefId && (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-text">Ad-hoc context</label>
            <textarea value={adHoc} onChange={(e) => setAdHoc(e.target.value)} rows={2} placeholder="Whatever context you have — a product, a vibe, a constraint…"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        )}

        {briefId && batches.length > 0 && (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-text">Target batch (for promoting an angle)</label>
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring">
              {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}

        <button onClick={generate} disabled={loading}
          className="mt-4 flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-onPrimary hover:opacity-90 disabled:opacity-50 cursor-pointer">
          <Sparkles size={16} aria-hidden /> {loading ? 'Thinking…' : 'Generate angles'}
        </button>
      </div>

      {angles.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {angles.map((a) => (
            <div key={a.angle_no} className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-1.5 flex items-center gap-1.5">
                <Lightbulb size={14} className="text-accent" aria-hidden />
                <span className="font-data text-[11px] uppercase tracking-wide text-mutedText">{a.hook_label}</span>
              </div>
              <p className="text-sm font-medium text-text">{a.one_liner}</p>
              <p className="mt-1.5 text-xs text-mutedText">{a.why_it_works}</p>
              {briefId && (
                <button onClick={() => promote(a.angle_no)} disabled={promoting === a.angle_no}
                  className="mt-3 rounded-md border border-primary px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50 cursor-pointer">
                  {promoting === a.angle_no ? 'Promoting…' : 'Promote to full naskah'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
