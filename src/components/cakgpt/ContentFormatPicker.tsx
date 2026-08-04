'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { CONTENT_FORMAT_PRESETS, MAX_CUSTOM_FORMAT_LEN } from '@/lib/cakgpt/content-formats'

/**
 * Content format ("tipe konten") selector.
 *
 * The presets are a shortcut, not a menu of the only allowed answers — the
 * custom box below them produces a format that is locked exactly as hard. That
 * matters: format used to be typed into the free-text "Arahan" box and was
 * reliably ignored, so the point here is that ANY value chosen becomes a real
 * constraint, whether we listed it or not.
 *
 * Selecting several formats multiplies the fan-out (brief × persona × format),
 * which is how one topic gets both a talking head and a vlog to compare.
 */
export function ContentFormatPicker({ value, onChange, disabled }: {
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  const [customDraft, setCustomDraft] = useState('')

  const presetKeys = new Set(CONTENT_FORMAT_PRESETS.map((f) => f.key))
  const customs = value.filter((v) => !presetKeys.has(v))

  function toggle(key: string) {
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key])
  }

  function addCustom() {
    const entry = customDraft.trim().slice(0, MAX_CUSTOM_FORMAT_LEN)
    if (!entry) return
    // Case-insensitive dedupe so "Vlog santai" and "vlog santai" don't both
    // enter the fan-out and generate two near-identical naskah.
    if (value.some((v) => v.toLowerCase() === entry.toLowerCase())) { setCustomDraft(''); return }
    onChange([...value, entry])
    setCustomDraft('')
  }

  return (
    <div className="space-y-2">
      <div>
        <span className="block text-xs font-medium text-text">Tipe konten (opsional)</span>
        <span className="block text-[11px] text-mutedText">
          Dikunci di prompt — bukan sekadar arahan. Centang lebih dari satu buat bandingin format di topik yang sama.
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CONTENT_FORMAT_PRESETS.map((f) => {
          const on = value.includes(f.key)
          return (
            <button
              key={f.key}
              type="button"
              disabled={disabled}
              onClick={() => toggle(f.key)}
              title={f.blurb}
              aria-pressed={on}
              className={`rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50 cursor-pointer ${
                on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-mutedText hover:bg-muted'
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {customs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {customs.map((c) => (
            <span key={c} className="flex items-center gap-1 rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
              {c}
              <button type="button" onClick={() => toggle(c)} aria-label={`Hapus format ${c}`} className="cursor-pointer">
                <X size={11} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
        <input
          value={customDraft}
          onChange={(e) => setCustomDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
          maxLength={MAX_CUSTOM_FORMAT_LEN}
          disabled={disabled}
          placeholder="…atau ketik format sendiri (misal: ASMR unboxing)"
          aria-label="Format konten custom"
          className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={disabled || !customDraft.trim()}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-text hover:bg-muted disabled:opacity-40 cursor-pointer"
        >
          <Plus size={12} aria-hidden /> Tambah
        </button>
      </div>
    </div>
  )
}
