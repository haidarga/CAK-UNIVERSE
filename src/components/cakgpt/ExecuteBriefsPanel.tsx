'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Zap, X } from 'lucide-react'
import { MAX_DAY_TOTAL, MAX_FANOUT_ITEMS } from '@/lib/cakgpt/schemas'
import { OutputTypePicker } from '@/components/cakgpt/OutputTypePicker'
import { ContentFormatPicker } from '@/components/cakgpt/ContentFormatPicker'
import { PakemPicker } from '@/components/cakgpt/PakemPicker'
import { resolveOutputType } from '@/lib/cakgpt/output-types'

function clampDays(n: number) {
  return Math.min(MAX_DAY_TOTAL, Math.max(1, Math.floor(n) || 1))
}

/**
 * Run the normal generation flow directly on briefs already in the library.
 *
 * Before this, generating from an existing brief meant opening some batch and
 * finding it in a list of every ready brief in the workspace — fine for one,
 * unusable for the 40 that arrive in a single content plan. Selecting them
 * where they are read is the natural place to act on them.
 *
 * Mechanically identical to Import & Generate downstream: it creates a batch
 * and posts the same fan-out items, so nothing about generation behaves
 * differently depending on where the run was started.
 */
export function ExecuteBriefsPanel({ briefIds, personas, clientId, onClose }: {
  briefIds: string[]
  personas: Array<{ id: string; name: string; cluster?: string | null }>
  clientId: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([])
  const [outputType, setOutputType] = useState('video')
  const [activeFormats, setActiveFormats] = useState<string[]>([])
  const [pakemId, setPakemId] = useState<string | null>(null)
  const [steering, setSteering] = useState('')
  const [days, setDays] = useState(1)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const dayTotal = clampDays(days)
  const formatCount = Math.max(1, activeFormats.length)
  const personaCount = Math.max(1, selectedPersonaIds.length)
  const projected = briefIds.length * personaCount * dayTotal * formatCount
  const over = projected > MAX_FANOUT_ITEMS

  function togglePersona(id: string) {
    setSelectedPersonaIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  async function execute() {
    if (briefIds.length === 0) return
    if (over) {
      setError(`Kebanyakan: ${projected.toLocaleString('id-ID')} naskah (maks ${MAX_FANOUT_ITEMS.toLocaleString('id-ID')}/run).`)
      return
    }
    setBusy(true); setError(null)
    try {
      // A batch is what the queue, the QC view and both exports are keyed on,
      // so one is created per run rather than appending to some existing batch.
      setProgress('Bikin batch…')
      const batchRes = await fetch('/api/scriptwriter/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Execute ${briefIds.length} brief · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
          client_id: clientId || undefined,
        }),
      })
      const batchData = await batchRes.json()
      if (!batchData.ok) { setError(batchData.error || 'gagal bikin batch'); return }
      const batchId = batchData.batch.id

      // No persona ticked = null, which makes the server fall back to each
      // brief's own default persona — the same rule Import & Generate uses.
      const personaTargets: Array<string | null> = selectedPersonaIds.length > 0 ? selectedPersonaIds : [null]
      const formats: Array<string | undefined> = activeFormats.length > 0 ? activeFormats : [undefined]
      const arahan = steering.trim() || undefined

      const items: Array<Record<string, unknown>> = []
      for (const brief_id of briefIds) {
        for (const persona_id of personaTargets) {
          for (const content_format of formats) {
            if (dayTotal === 1) {
              items.push({ brief_id, persona_id, extra_context: arahan, content_format, pakem_id: pakemId || undefined, output_type: outputType })
            } else {
              for (let d = 1; d <= dayTotal; d++) {
                items.push({ brief_id, persona_id, extra_context: arahan, content_format, pakem_id: pakemId || undefined, output_type: outputType, day_no: d, day_total: dayTotal })
              }
            }
          }
        }
      }

      setProgress(`Queueing ${items.length} naskah…`)
      const genRes = await fetch(`/api/scriptwriter/batches/${batchId}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
      })
      const genData = await genRes.json()
      if (!genData.ok) {
        // The batch exists either way, so point at it instead of stranding the
        // run with nothing to open.
        setError(`${genData.error || 'gagal queue generation'} — batch-nya udah kebikin, buka manual buat retry.`)
        return
      }
      router.push(`/studio/script/batches/${batchId}`)
    } catch {
      setError('network error')
    } finally {
      setBusy(false); setProgress(null)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/40 bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text">Execute {briefIds.length} brief</h3>
          <p className="text-[11px] text-mutedText">Bikin batch baru terus langsung generate — sama persis kayak Import &amp; Generate.</p>
        </div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Tutup"
          className="shrink-0 rounded p-1 text-mutedText hover:bg-muted cursor-pointer disabled:opacity-50">
          <X size={15} aria-hidden />
        </button>
      </div>

      <OutputTypePicker value={outputType} onChange={setOutputType} disabled={busy} />

      {resolveOutputType(outputType).supportsContentFormat && (
        <ContentFormatPicker value={activeFormats} onChange={setActiveFormats} disabled={busy} />
      )}

      <PakemPicker clientId={clientId} value={pakemId} onChange={setPakemId} selectedFormats={activeFormats} disabled={busy} />

      <div>
        <span className="mb-1 block text-xs font-medium text-text">
          Persona <span className="font-normal text-mutedText">— kosongin = pakai persona bawaan tiap brief</span>
        </span>
        <div className="flex flex-wrap gap-1.5">
          {personas.map((p) => {
            const on = selectedPersonaIds.includes(p.id)
            return (
              <button key={p.id} type="button" disabled={busy} onClick={() => togglePersona(p.id)} aria-pressed={on}
                className={`rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50 cursor-pointer ${
                  on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-mutedText hover:bg-muted'
                }`}>
                {p.name}{p.cluster ? <span className="ml-1 opacity-70">({p.cluster})</span> : null}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label htmlFor="exec-arahan" className="mb-1 block text-xs font-medium text-text">
          Arahan <span className="font-normal text-mutedText">(opsional)</span>
        </label>
        <textarea id="exec-arahan" value={steering} onChange={(e) => setSteering(e.target.value)} disabled={busy}
          maxLength={4000} rows={2}
          placeholder="mis. durasi 15 detik, fokus ke kuliner lokal, hindari kata 'wajib'…"
          className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-text outline-none placeholder:text-mutedText focus:border-primary disabled:opacity-60" />
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="exec-days" className="text-[11px] font-medium text-text">Hari/topik</label>
        <input id="exec-days" type="number" min={1} max={MAX_DAY_TOTAL} value={days} disabled={busy}
          onChange={(e) => setDays(clampDays(parseInt(e.target.value, 10) || 1))}
          className="w-16 rounded-md border border-border bg-background px-2 py-1 text-xs text-text outline-none focus:border-primary disabled:opacity-60" />
        <span className={`text-[11px] font-medium ${over ? 'text-destructive' : 'text-mutedText'}`}>
          → {projected.toLocaleString('id-ID')} naskah
          {over && ` (lewat batas ${MAX_FANOUT_ITEMS.toLocaleString('id-ID')})`}
        </span>
      </div>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      <button type="button" onClick={execute} disabled={busy || over || briefIds.length === 0}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent py-2 text-sm font-medium text-onPrimary hover:opacity-90 disabled:opacity-50 cursor-pointer">
        {busy
          ? <><Loader2 size={15} className="animate-spin" aria-hidden /> {progress || 'Working…'}</>
          : <><Zap size={15} aria-hidden /> Execute &amp; Generate</>}
      </button>
    </div>
  )
}
