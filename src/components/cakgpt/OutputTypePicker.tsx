'use client'

import { OUTPUT_TYPES, resolveOutputType } from '@/lib/cakgpt/output-types'

/**
 * Picks the ARTIFACT being produced — video script, carousel, or blog article.
 *
 * Single-select rather than multi: unlike content format, these are not
 * variations of one thing to compare side by side. Fanning a topic out into a
 * video AND an article at once would mix two unrelated deliverables into one
 * batch, and the batch is what Push to Studio and the exports act on.
 */
export function OutputTypePicker({ value, onChange, disabled }: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}) {
  const active = resolveOutputType(value)

  return (
    <div className="space-y-1.5">
      <div>
        <span className="block text-xs font-medium text-text">Tipe naskah</span>
        <span className="block text-[11px] text-mutedText">Mau bikin apa — ini nentuin bentuk outputnya, bukan cuma gayanya.</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {OUTPUT_TYPES.map((t) => {
          const on = active.key === t.key
          return (
            <button
              key={t.key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(t.key)}
              title={t.blurb}
              aria-pressed={on}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50 cursor-pointer ${
                on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-mutedText hover:bg-muted'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <p className="text-[11px] text-mutedText">{active.blurb}</p>

      {/* Said up front, not discovered at push time: the studio renders shots,
          so text output can only leave via Docs or Spreadsheet. */}
      {!active.supportsStudioPush && (
        <p className="rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] text-mutedText">
          Tipe ini gak bisa di-push ke Video Studio — keluarnya lewat Google Docs atau Spreadsheet.
        </p>
      )}
    </div>
  )
}
