'use client'

import { useState } from 'react'
import { Sparkles, Loader2, Upload, ClipboardPaste, Search, AlertTriangle, X } from 'lucide-react'
import {
  BRAND_CONTEXT_FIELDS,
  EMPTY_BRAND_CONTEXT,
  riskyRuleEntries,
  parseRuleList,
  type BrandContext,
} from '@/lib/cakgpt/brand-context'
import { uploadFileForImport } from '@/lib/cakgpt/upload-client'

type FillMode = 'brand_name' | 'document' | 'text'

const MODES: Array<{ key: FillMode; label: string; icon: typeof Search; blurb: string }> = [
  { key: 'brand_name', label: 'Dari nama brand', icon: Search, blurb: 'AI isi dari pengetahuannya sendiri soal brand ini. Gak browsing internet — kalau brandnya kecil/gak dikenal, field-nya sengaja dibiarin kosong daripada ngarang.' },
  { key: 'document', label: 'Upload brand guideline', icon: Upload, blurb: 'PDF / DOCX / XLSX brand book dari klien. Paling akurat karena sumbernya dokumen resmi.' },
  { key: 'text', label: 'Paste teks', icon: ClipboardPaste, blurb: 'WA dari klien, email brief, notulen meeting — apa aja. AI strukturin jadi 9 field.' },
]

export function BrandContextEditor({ brandName, value, onChange }: {
  brandName: string
  value: BrandContext
  onChange: (next: BrandContext) => void
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<FillMode>('brand_name')
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Recomputed locally on every keystroke rather than only on the server
  // response, so a self-blocking rule is visible while it is being typed.
  const risks = riskyRuleEntries(value, brandName)

  function setField(key: keyof BrandContext, next: string) {
    onChange({ ...value, [key]: next })
  }

  async function runFill(payload: Record<string, unknown>) {
    setBusy(true); setError(null); setNotice(null)
    try {
      const res = await fetch('/api/scriptwriter/clients/extract-context', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_name: brandName, ...payload }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error || 'ekstraksi gagal'); return }
      if (data.empty) { setNotice(data.message || 'AI gak nemu apa-apa.'); return }
      // Merge, never clobber: fields the writer already filled win over the
      // model, so re-running the AI cannot wipe hand-written brand rules.
      const merged = { ...EMPTY_BRAND_CONTEXT, ...value }
      for (const { key } of BRAND_CONTEXT_FIELDS) {
        if (!merged[key]?.trim() && data.context?.[key]?.trim()) merged[key] = data.context[key]
      }
      onChange(merged)
      setNotice('Hasil AI udah dimasukin ke field yang masih kosong. Review dulu sebelum simpan — field yang udah lu isi sendiri gak diubah.')
      setOpen(false)
    } catch {
      setError('network error')
    } finally {
      setBusy(false)
    }
  }

  async function fillFromFile(file: File) {
    setBusy(true); setError(null); setNotice(null)
    try {
      // Reuses the briefs/naskah import uploader: browser -> Supabase Storage
      // directly, because a brand book easily exceeds Vercel's 4.5MB request
      // body cap, which app code cannot raise.
      const up = await uploadFileForImport(file)
      if (!up.ok) { setError(up.error); return }
      await runFill({ source: 'document', storage_path: up.path })
    } catch {
      setError('network error saat upload')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">Brand &amp; Market Context</h3>
        <button type="button" onClick={() => setOpen((v) => !v)} disabled={busy}
          className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50 cursor-pointer">
          {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Sparkles size={13} aria-hidden />}
          {busy ? 'AI lagi kerja…' : 'Isi pakai AI'}
        </button>
      </div>

      <p className="text-xs text-mutedText">
        Diinjeksi ke prompt penulisan naskah di atas brief. <strong className="font-medium text-text">DILARANG</strong> dan{' '}
        <strong className="font-medium text-text">Wajib Gunakan Ini</strong> juga jadi aturan QC otomatis — naskah yang langgar kena blocker dan gak bisa di-approve.
      </p>

      {open && (
        <div className="space-y-2.5 rounded-md border border-border bg-muted/40 p-3">
          <div className="flex flex-wrap gap-1.5">
            {MODES.map((m) => (
              <button key={m.key} type="button" onClick={() => setMode(m.key)}
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium cursor-pointer ${
                  mode === m.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-mutedText hover:bg-muted'
                }`}>
                <m.icon size={12} aria-hidden /> {m.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-mutedText">{MODES.find((m) => m.key === mode)?.blurb}</p>

          {mode === 'brand_name' && (
            <button type="button" disabled={busy || !brandName.trim()}
              onClick={() => runFill({ source: 'brand_name' })}
              className="w-full rounded-md bg-primary py-1.5 text-xs font-medium text-onPrimary hover:opacity-90 disabled:opacity-50 cursor-pointer">
              {brandName.trim() ? `Cari info "${brandName.trim()}"` : 'Isi nama brand dulu di atas'}
            </button>
          )}

          {mode === 'document' && (
            <input type="file" accept=".pdf,.docx,.xlsx,.txt,.md,.csv" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) fillFromFile(f); e.target.value = '' }}
              aria-label="Upload brand guideline"
              className="w-full text-xs text-mutedText file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-onPrimary file:cursor-pointer" />
          )}

          {mode === 'text' && (
            <>
              <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={5}
                placeholder="Paste apa aja soal brand ini — brief dari klien, chat WA, notulen meeting…"
                aria-label="Teks sumber brand context"
                className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
              <button type="button" disabled={busy || !pasted.trim()}
                onClick={() => runFill({ source: 'text', text: pasted })}
                className="w-full rounded-md bg-primary py-1.5 text-xs font-medium text-onPrimary hover:opacity-90 disabled:opacity-50 cursor-pointer">
                Strukturin jadi 9 field
              </button>
            </>
          )}
        </div>
      )}

      {notice && (
        <div className="flex items-start justify-between gap-2 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs text-primary">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Tutup pesan" className="shrink-0 cursor-pointer"><X size={13} /></button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {risks.length > 0 && (
        <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
            <AlertTriangle size={13} aria-hidden /> Aturan ini bakal nge-block kebanyakan naskah
          </p>
          {risks.map((r, i) => (
            <p key={`${r.entry}-${i}`} className="text-[11px] text-warning">
              <span className="font-data font-medium">&quot;{r.entry}&quot;</span> — {r.reason}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-2.5">
        {BRAND_CONTEXT_FIELDS.map((f) => {
          const count = f.isRuleList ? parseRuleList(value[f.key]).length : 0
          return (
            <div key={f.key}>
              <label htmlFor={`bc-${f.key}`} className="mb-1 block text-xs font-medium text-text">
                {f.label}
                {f.isRuleList && count > 0 && (
                  <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 font-data text-[10px] font-normal text-mutedText">
                    {count} aturan QC
                  </span>
                )}
                <span className="ml-1 block font-normal text-[11px] text-mutedText">{f.hint}</span>
              </label>
              <textarea
                id={`bc-${f.key}`}
                value={value[f.key] || ''}
                onChange={(e) => setField(f.key, e.target.value)}
                rows={f.isRuleList ? 4 : 2}
                placeholder={f.isRuleList ? 'satu kata / frasa per baris' : ''}
                className={`w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring ${f.isRuleList ? 'font-data text-xs' : ''}`}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
