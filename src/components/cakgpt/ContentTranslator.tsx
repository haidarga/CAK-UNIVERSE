'use client'

import { useRef, useState } from 'react'
import { Upload, Loader2, Copy, Check, ImageIcon, Sparkles, X } from 'lucide-react'
import { uploadFileForImport, MAX_IMPORT_UPLOAD_BYTES } from '@/lib/cakgpt/upload-client'

type VisualDirection = {
  hook_type: string
  hook_description: string
  visual_style: string
  pacing: string
  mood: string
  target_audience_read: string
  cta_style?: string | null
  notable_techniques: string[]
  shot_breakdown: { shot_no: number; description: string; camera_angle?: string | null }[]
  suggested_angle_for_reuse: string
}

const ACCEPTED = 'image/png,image/jpeg,image/webp,image/heic,image/heif'

function directionToArahan(d: VisualDirection): string {
  const lines = [
    `Hook: ${d.hook_type} — ${d.hook_description}`,
    `Visual style: ${d.visual_style}`,
    `Pacing: ${d.pacing}`,
    `Mood: ${d.mood}`,
    d.cta_style ? `CTA style: ${d.cta_style}` : '',
    d.notable_techniques.length ? `Teknik yang dipakai: ${d.notable_techniques.join('; ')}` : '',
    `Cara adaptasi: ${d.suggested_angle_for_reuse}`,
  ].filter(Boolean)
  return lines.join('\n')
}

export function ContentTranslator() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [direction, setDirection] = useState<VisualDirection | null>(null)
  const [copied, setCopied] = useState(false)

  function pickFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setDirection(null)
    setFileName(file.name)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
  }

  function reset() {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null); setFileName(null); setNote(''); setError(null); setDirection(null); setCopied(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function translate() {
    const file = fileRef.current?.files?.[0]
    if (!file) { setError('pilih gambar dulu'); return }
    setBusy(true); setError(null); setDirection(null)
    try {
      const uploaded = await uploadFileForImport(file)
      if (!uploaded.ok) { setError(uploaded.error); return }

      const res = await fetch('/api/scriptwriter/translator/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_path: uploaded.path, mime_type: file.type, note: note.trim() || undefined }),
      })
      let data: { ok?: boolean; error?: string; direction?: VisualDirection }
      try {
        data = await res.json()
      } catch {
        setError(`Server error (status ${res.status}) — coba lagi.`)
        return
      }
      if (!data.ok || !data.direction) { setError(data.error || 'analisis gagal'); return }
      setDirection(data.direction)
    } catch (e) {
      setError(e instanceof Error && e.message ? `Network error: ${e.message}` : 'network error saat translate')
    } finally {
      setBusy(false)
    }
  }

  async function copyArahan() {
    if (!direction) return
    try {
      await navigator.clipboard.writeText(directionToArahan(direction))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[220px_1fr]">
          <div>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED}
              disabled={busy}
              onChange={(e) => pickFile(e.target.files?.[0])}
              className="hidden"
              id="translator-file"
            />
            {preview ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="" className="h-52 w-full rounded-lg border border-border object-cover" />
                {!busy && (
                  <button
                    type="button"
                    onClick={reset}
                    aria-label="Remove image"
                    className="absolute right-1.5 top-1.5 rounded-full bg-background/90 p-1 text-mutedText hover:text-destructive"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ) : (
              <label
                htmlFor="translator-file"
                className="flex h-52 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-mutedText hover:border-primary hover:text-primary"
              >
                <ImageIcon size={24} aria-hidden />
                <span className="text-xs font-medium">Pilih gambar</span>
                <span className="text-[11px]">Maks {MAX_IMPORT_UPLOAD_BYTES / 1024 / 1024} MB</span>
              </label>
            )}
            {fileName && <p className="mt-1.5 truncate text-[11px] text-mutedText">{fileName}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <div>
              <label htmlFor="translator-note" className="mb-1 block text-xs font-medium text-text">
                Fokus analisis <span className="font-normal text-mutedText">(opsional)</span>
              </label>
              <textarea
                id="translator-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy}
                maxLength={1000}
                rows={4}
                placeholder="mis. Fokus ke cara dia buka hook-nya, atau ke gaya visual/warnanya aja…"
                className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text outline-none placeholder:text-mutedText focus:border-primary disabled:opacity-60"
              />
            </div>
            <button
              onClick={translate}
              disabled={busy || !preview}
              className="mt-auto flex items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-sm font-medium text-onPrimary hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Menganalisis…</> : <><Sparkles size={15} aria-hidden /> Translate ke direction</>}
            </button>
          </div>
        </div>
        {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
      </div>

      {direction && (
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Creative Direction</h2>
            <button
              onClick={copyArahan}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Tersalin' : 'Salin sebagai Arahan'}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Hook type" value={direction.hook_type} />
            <Field label="Mood" value={direction.mood} />
            <Field label="Pacing" value={direction.pacing} />
            <Field label="Target audience" value={direction.target_audience_read} />
          </div>
          <Field label="Hook description" value={direction.hook_description} block />
          <Field label="Visual style" value={direction.visual_style} block />
          {direction.cta_style && <Field label="CTA style" value={direction.cta_style} block />}

          {direction.notable_techniques.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-mutedText">Teknik yang dipakai</p>
              <div className="flex flex-wrap gap-1.5">
                {direction.notable_techniques.map((t, i) => (
                  <span key={i} className="rounded bg-muted px-2 py-0.5 text-xs text-text">{t}</span>
                ))}
              </div>
            </div>
          )}

          {direction.shot_breakdown.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-mutedText">Shot breakdown</p>
              <div className="space-y-1">
                {direction.shot_breakdown.map((s) => (
                  <div key={s.shot_no} className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs">
                    <span className="font-data font-semibold text-primary">#{s.shot_no}</span>{' '}
                    <span className="text-text">{s.description}</span>
                    {s.camera_angle && <span className="text-mutedText"> — {s.camera_angle}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <Field label="Cara adaptasi ke brand lain" value={direction.suggested_angle_for_reuse} block accent />
        </div>
      )}
    </div>
  )
}

function Field({ label, value, block, accent }: { label: string; value: string; block?: boolean; accent?: boolean }) {
  return (
    <div className={block ? '' : undefined}>
      <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-mutedText">{label}</p>
      <p className={`text-sm ${accent ? 'font-medium text-accent' : 'text-text'}`}>{value}</p>
    </div>
  )
}
