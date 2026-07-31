'use client'

import { useRef, useState } from 'react'
import { Image as ImageIcon, Sparkles, Loader2, X, Copy, Check } from 'lucide-react'
import { uploadFileForImport, MAX_IMPORT_UPLOAD_BYTES } from '@/lib/cakgpt/upload-client'

type Shot = { shot_no: number; description: string; camera_angle?: string }
type VisualDirection = {
  hook_type: string
  hook_description: string
  visual_style: string
  mood: string
  pacing: string
  target_audience_read: string
  cta_style?: string
  notable_techniques: string[]
  shot_breakdown: Shot[]
  suggested_angle_for_reuse: string
}

const ACCEPTED = '.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,.m4v'
const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 / 1024 >= 50 ? 50 * 1024 * 1024 : 50 * 1024 * 1024

function isVideoFile(f: File): boolean {
  return f.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(f.name)
}

function directionToArahan(d: VisualDirection): string {
  const lines = [
    `HOOK (${d.hook_type.toUpperCase()}): ${d.hook_description}`,
    `VISUAL STYLE: ${d.visual_style}`,
    `MOOD & PACING: ${d.mood}, ${d.pacing}`,
    `TARGET AUDIENCE: ${d.target_audience_read}`,
    d.cta_style ? `CTA STYLE: ${d.cta_style}` : '',
    d.notable_techniques.length ? `Teknik yang dipakai: ${d.notable_techniques.join('; ')}` : '',
    `Cara adaptasi: ${d.suggested_angle_for_reuse}`,
  ].filter(Boolean)
  return lines.join('\n')
}

export function ContentTranslator() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [previewIsVideo, setPreviewIsVideo] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [direction, setDirection] = useState<VisualDirection | null>(null)
  const [copied, setCopied] = useState(false)

  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [knowledgeTitle, setKnowledgeTitle] = useState('')
  const [savingKnowledge, setSavingKnowledge] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  function pickFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setDirection(null)
    setFileName(file.name)
    setPreviewIsVideo(isVideoFile(file))
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
  }

  function reset() {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null); setPreviewIsVideo(false); setFileName(null); setNote(''); setError(null); setDirection(null); setCopied(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function translate() {
    const file = fileRef.current?.files?.[0]
    if (!file) { setError('pilih gambar atau video dulu'); return }
    setBusy(true); setError(null); setDirection(null)
    try {
      const uploaded = await uploadFileForImport(file, isVideoFile(file) ? MAX_VIDEO_UPLOAD_BYTES : MAX_IMPORT_UPLOAD_BYTES)
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

  async function saveToKnowledge() {
    if (!direction || !knowledgeTitle.trim()) return
    setSavingKnowledge(true)
    try {
      const content = directionToArahan(direction) + '\n\nShot Breakdown:\n' + direction.shot_breakdown.map(s => `#${s.shot_no}: ${s.description}`).join('\n')
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: knowledgeTitle.trim(),
          content,
          source_type: 'content_translator',
          metadata: { direction, fileName },
          tags: ['translator', direction.hook_type, direction.visual_style].filter(Boolean),
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setSaveSuccess(true)
        setTimeout(() => { setSaveSuccess(false); setSaveModalOpen(false); setKnowledgeTitle('') }, 1500)
      } else {
        alert(data.error || 'Gagal menyimpan knowledge')
      }
    } catch {
      alert('Gagal menghubungi server')
    } finally {
      setSavingKnowledge(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-text">🧠 Simpan ke Knowledge Base</h3>
              <button onClick={() => setSaveModalOpen(false)} className="text-mutedText hover:text-text">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-mutedText">
              Beri nama referensi ini (contoh: <span className="text-primary italic">"referensi acekid 1"</span>) agar bisa digunakan kembali di Brief & Naskah:
            </p>
            <input
              type="text"
              value={knowledgeTitle}
              onChange={(e) => setKnowledgeTitle(e.target.value)}
              placeholder="e.g. referensi acekid 1"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-text outline-none focus:border-primary"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setSaveModalOpen(false)}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-mutedText hover:bg-muted"
              >
                Batal
              </button>
              <button
                onClick={saveToKnowledge}
                disabled={savingKnowledge || !knowledgeTitle.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-bold text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {savingKnowledge ? <Loader2 size={13} className="animate-spin" /> : saveSuccess ? <Check size={13} /> : null}
                {saveSuccess ? 'Tersimpan!' : 'Simpan Knowledge'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                {previewIsVideo ? (
                  <video src={preview} controls muted className="h-52 w-full rounded-lg border border-border object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="h-52 w-full rounded-lg border border-border object-cover" />
                )}
                {!busy && (
                  <button
                    type="button"
                    onClick={reset}
                    aria-label="Remove file"
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
                <span className="text-xs font-medium">Pilih gambar / video</span>
                <span className="text-[11px]">Gambar maks {MAX_IMPORT_UPLOAD_BYTES / 1024 / 1024} MB · Video maks {MAX_VIDEO_UPLOAD_BYTES / 1024 / 1024} MB</span>
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
              {busy
                ? <><Loader2 size={15} className="animate-spin" aria-hidden /> {previewIsVideo ? 'Menganalisis video (bisa 1-2 menit)…' : 'Menganalisis…'}</>
                : <><Sparkles size={15} aria-hidden /> Translate ke direction</>}
            </button>
          </div>
        </div>
        {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
      </div>

      {direction && (
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-text">Creative Direction</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setKnowledgeTitle(`Referensi — ${direction.hook_type}`); setSaveModalOpen(true) }}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20"
              >
                🧠 Simpan ke Knowledge
              </button>
              <button
                onClick={copyArahan}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Tersalin' : 'Salin sebagai Arahan'}
              </button>
            </div>
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
