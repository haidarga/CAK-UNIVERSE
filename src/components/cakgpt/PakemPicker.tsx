'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { detectPakemFormatClash, EMPTY_PAKEM, formatShotRange, type PakemStructure } from '@/lib/cakgpt/script-pakem'

type PakemRow = { id: string; name: string; structure: PakemStructure }

/**
 * Pakem selector for the generate flow.
 *
 * Shows a clash warning rather than resolving the conflict silently: the writer
 * ticked a content format seconds ago and the pakem is a stored default, so
 * discarding either one without saying so leaves them wondering why the output
 * ignored what they asked for. The format wins; the pakem still supplies beat
 * order, pacing and voice.
 */
export function PakemPicker({ clientId, value, onChange, selectedFormats, disabled }: {
  clientId: string | null
  value: string | null
  onChange: (id: string | null) => void
  selectedFormats: string[]
  disabled?: boolean
}) {
  const [rows, setRows] = useState<PakemRow[]>([])

  useEffect(() => {
    if (!clientId) { setRows([]); return }
    let cancelled = false
    fetch(`/api/scriptwriter/pakem?client_id=${encodeURIComponent(clientId)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.ok) setRows(d.pakem) })
      .catch(() => { /* the picker is optional — a failed load just hides it */ })
    return () => { cancelled = true }
  }, [clientId])

  // Clear a selection that is no longer valid for the current client, so a
  // stale id cannot be submitted after switching brands.
  useEffect(() => {
    if (value && !rows.some((r) => r.id === value)) onChange(null)
  }, [rows, value, onChange])

  if (!clientId || rows.length === 0) return null

  const active = rows.find((r) => r.id === value)
  const structure = active ? { ...EMPTY_PAKEM, ...active.structure } : null
  const clash = detectPakemFormatClash(structure, selectedFormats)

  return (
    <div className="space-y-1.5">
      <div>
        <span className="block text-xs font-medium text-text">Pakem script (opsional)</span>
        <span className="block text-[11px] text-mutedText">Struktur rumah brand ini — naskah dibikin ngikutin bentuknya.</span>
      </div>

      <select
        value={value || ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="Pakem script"
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
      >
        <option value="">— tanpa pakem —</option>
        {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>

      {structure && (
        <p className="text-[11px] text-mutedText">
          {[structure.section_flow.join(' → '), formatShotRange(structure)].filter(Boolean).join(' · ') || 'struktur kosong'}
        </p>
      )}

      {clash && (
        <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-[11px] text-warning">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
          <span>{clash.message}</span>
        </p>
      )}
    </div>
  )
}
