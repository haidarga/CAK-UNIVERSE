'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'

type QuirkRow = { quirk: string; example: string }
type SampleLineRow = { context: string; line: string }
type RedFlagRow = { description: string; example: string }

function RepeatableRows<T extends Record<string, string>>({
  rows, setRows, fields, addLabel,
}: {
  rows: T[]
  setRows: (rows: T[]) => void
  fields: Array<{ key: keyof T; placeholder: string }>
  addLabel: string
}) {
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-1.5">
          {fields.map((f) => (
            <input
              key={String(f.key)}
              value={row[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => {
                const next = [...rows]
                next[i] = { ...next[i], [f.key]: e.target.value }
                setRows(next)
              }}
              className="w-full min-w-0 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ))}
          <button
            type="button"
            aria-label="Remove row"
            onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
            className="shrink-0 rounded-md p-1.5 text-mutedText hover:bg-muted hover:text-destructive cursor-pointer"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows([...rows, Object.fromEntries(fields.map((f) => [f.key, ''])) as T])}
        className="flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
      >
        <Plus size={12} aria-hidden /> {addLabel}
      </button>
    </div>
  )
}

export function PersonaForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [cluster, setCluster] = useState('')
  const [register, setRegister] = useState('')
  const [pacing, setPacing] = useState('')
  const [energy, setEnergy] = useState('')
  const [adjectives, setAdjectives] = useState('')
  const [bannedWords, setBannedWords] = useState('')
  const [requiredWords, setRequiredWords] = useState('')
  const [quirks, setQuirks] = useState<QuirkRow[]>([])
  const [sampleLines, setSampleLines] = useState<SampleLineRow[]>([])
  const [redFlags, setRedFlags] = useState<RedFlagRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Name is required')
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/scriptwriter/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          cluster: cluster.trim() || null,
          tone: { register, pacing, energy, adjectives: adjectives.split(',').map((s) => s.trim()).filter(Boolean) },
          diction_quirks: quirks.filter((q) => q.quirk),
          banned_words: bannedWords.split(',').map((s) => s.trim()).filter(Boolean),
          required_words: requiredWords.split(',').map((s) => s.trim()).filter(Boolean),
          sample_lines: sampleLines.filter((s) => s.line),
          red_flags: redFlags.filter((r) => r.description),
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'failed to save')

      setName(''); setCluster(''); setRegister(''); setPacing(''); setEnergy(''); setAdjectives('')
      setBannedWords(''); setRequiredWords(''); setQuirks([]); setSampleLines([]); setRedFlags([])
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-text">New persona</h2>

      <div>
        <label className="mb-1 block text-xs font-medium text-text">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text">Cluster <span className="font-normal text-mutedText">(audience segment, e.g. "Working Mom", "Dad Persona" — optional)</span></label>
        <input value={cluster} onChange={(e) => setCluster(e.target.value)} placeholder="e.g. Nutrition Mom"
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
        <p className="mt-1 text-[11px] text-mutedText">Personas with a cluster only get auto-matched to briefs tagged the same cluster during Import & Generate.</p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text">Tone</label>
        <div className="grid grid-cols-3 gap-1.5">
          <input value={register} onChange={(e) => setRegister(e.target.value)} placeholder="Register"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
          <input value={pacing} onChange={(e) => setPacing(e.target.value)} placeholder="Pacing"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
          <input value={energy} onChange={(e) => setEnergy(e.target.value)} placeholder="Energy"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <input value={adjectives} onChange={(e) => setAdjectives(e.target.value)} placeholder="Adjectives, comma separated"
          className="mt-1.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text">Diction quirks</label>
        <RepeatableRows rows={quirks} setRows={setQuirks} addLabel="Add quirk"
          fields={[{ key: 'quirk', placeholder: 'Quirk' }, { key: 'example', placeholder: 'Example' }]} />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text">Banned words <span className="font-normal text-mutedText">(comma separated)</span></label>
        <textarea value={bannedWords} onChange={(e) => setBannedWords(e.target.value)} rows={2}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text">Required words <span className="font-normal text-mutedText">(comma separated)</span></label>
        <textarea value={requiredWords} onChange={(e) => setRequiredWords(e.target.value)} rows={2}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text">Sample lines</label>
        <RepeatableRows rows={sampleLines} setRows={setSampleLines} addLabel="Add sample line"
          fields={[{ key: 'context', placeholder: 'Context' }, { key: 'line', placeholder: 'Line' }]} />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text">Red flags <span className="font-normal text-mutedText">(things this persona would never say)</span></label>
        <RepeatableRows rows={redFlags} setRows={setRedFlags} addLabel="Add red flag"
          fields={[{ key: 'description', placeholder: 'Description' }, { key: 'example', placeholder: 'Example' }]} />
      </div>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      <button type="submit" disabled={saving}
        className="w-full rounded-md bg-primary py-2 text-sm font-medium text-onPrimary transition-opacity duration-150 hover:opacity-90 disabled:opacity-50 cursor-pointer">
        {saving ? 'Saving…' : 'Save persona'}
      </button>
    </form>
  )
}
