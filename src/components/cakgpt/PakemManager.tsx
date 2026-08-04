'use client'

import { useCallback, useEffect, useState } from 'react'
import { Sparkles, Loader2, Upload, ClipboardPaste, Trash2, Plus, X, Save } from 'lucide-react'
import {
  EMPTY_PAKEM, formatShotRange, type PakemStructure,
} from '@/lib/cakgpt/script-pakem'
import { CONTENT_FORMAT_PRESETS } from '@/lib/cakgpt/content-formats'
import { uploadFileForImport } from '@/lib/cakgpt/upload-client'

type PakemRow = { id: string; name: string; structure: PakemStructure; source_excerpt: string | null }

/**
 * Script Pakem manager for one brand.
 *
 * The AI extraction is a FIRST DRAFT, not a verdict — every field below is
 * editable, and shot count in particular is expected to be overridden. Nothing
 * reaches the database until the writer presses Save.
 */
export function PakemManager({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [rows, setRows] = useState<PakemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Draft being created or edited. null = nothing open.
  const [draftId, setDraftId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draft, setDraft] = useState<PakemStructure>(EMPTY_PAKEM)
  const [sourceExcerpt, setSourceExcerpt] = useState<string | null>(null)
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState<'extract' | 'save' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/scriptwriter/pakem?client_id=${encodeURIComponent(clientId)}`)
      const data = await res.json()
      if (data.ok) setRows(data.pakem)
      else setError(data.error || 'gagal load pakem')
    } catch { setError('network error') } finally { setLoading(false) }
  }, [clientId])

  useEffect(() => { load() }, [load])

  function openNew() {
    setDraftId('new'); setDraftName(''); setDraft(EMPTY_PAKEM); setSourceExcerpt(null); setPasted(''); setNotice(null)
  }
  function openEdit(r: PakemRow) {
    setDraftId(r.id); setDraftName(r.name); setDraft({ ...EMPTY_PAKEM, ...r.structure })
    setSourceExcerpt(r.source_excerpt); setPasted(''); setNotice(null)
  }
  function closeDraft() { setDraftId(null); setNotice(null); setError(null) }

  function setField<K extends keyof PakemStructure>(key: K, value: PakemStructure[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  async function runExtract(payload: Record<string, unknown>) {
    setBusy('extract'); setError(null); setNotice(null)
    try {
      const res = await fetch('/api/scriptwriter/pakem/extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error || 'ekstraksi gagal'); return }
      setDraft({ ...EMPTY_PAKEM, ...data.structure })
      if (data.source_excerpt) setSourceExcerpt(data.source_excerpt)
      setNotice(data.empty
        ? data.message
        : 'Ini draft dari AI — cek dan ubah sesukanya (jumlah shot, alur, aturan). Belum kesimpen sampai lu klik Simpan.')
    } catch { setError('network error') } finally { setBusy(null) }
  }

  async function extractFromFile(file: File) {
    setBusy('extract'); setError(null)
    try {
      const up = await uploadFileForImport(file)
      if (!up.ok) { setError(up.error); return }
      await runExtract({ storage_path: up.path })
    } catch { setError('network error saat upload') } finally { setBusy(null) }
  }

  async function save() {
    if (!draftName.trim()) { setError('kasih nama dulu buat pakemnya'); return }
    setBusy('save'); setError(null)
    try {
      const isNew = draftId === 'new'
      const res = await fetch(isNew ? '/api/scriptwriter/pakem' : `/api/scriptwriter/pakem/${draftId}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isNew ? { client_id: clientId } : {}),
          name: draftName.trim(), structure: draft, source_excerpt: sourceExcerpt,
        }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error || 'gagal simpan'); return }
      closeDraft(); await load()
    } catch { setError('network error') } finally { setBusy(null) }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Hapus pakem "${name}"? Naskah yang udah dibikin pakai pakem ini tetap aman.`)) return
    try {
      const res = await fetch(`/api/scriptwriter/pakem/${id}`, { method: 'DELETE' })
      if ((await res.json()).ok) await load()
    } catch { setError('network error') }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text">Pakem Script</h3>
          <p className="text-[11px] text-mutedText">
            Contoh script yang udah di-approve {clientName || 'brand ini'}. AI bedah strukturnya, naskah baru ngikutin bentuknya.
          </p>
        </div>
        {!draftId && (
          <button type="button" onClick={openNew}
            className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text hover:bg-muted cursor-pointer">
            <Plus size={13} aria-hidden /> Pakem baru
          </button>
        )}
      </div>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {!draftId && (
        loading ? (
          <p className="text-xs text-mutedText">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-mutedText">
            Belum ada pakem. Klik &ldquo;Pakem baru&rdquo;, paste satu script yang udah oke, biar AI yang bedah strukturnya.
          </p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => {
              const range = formatShotRange({ ...EMPTY_PAKEM, ...r.structure })
              return (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-text">{r.name}</p>
                    <p className="truncate text-[11px] text-mutedText">
                      {[r.structure?.section_flow?.join(' → '), range, r.structure?.detected_format].filter(Boolean).join(' · ') || 'struktur kosong'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => openEdit(r)}
                      className="rounded px-2 py-1 text-[11px] font-medium text-text hover:bg-muted cursor-pointer">Edit</button>
                    <button type="button" onClick={() => remove(r.id, r.name)} aria-label={`Hapus ${r.name}`}
                      className="rounded p-1 text-mutedText hover:bg-destructive/10 hover:text-destructive cursor-pointer">
                      <Trash2 size={13} aria-hidden />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {draftId && (
        <div className="space-y-3 rounded-md border border-primary/30 bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <input
              value={draftName} onChange={(e) => setDraftName(e.target.value)} maxLength={200}
              placeholder="Nama pakem — misal: Pakem Edukasi" aria-label="Nama pakem"
              className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button type="button" onClick={closeDraft} aria-label="Tutup" className="shrink-0 rounded p-1 text-mutedText hover:bg-muted cursor-pointer">
              <X size={15} aria-hidden />
            </button>
          </div>

          {/* Source input — only offered while creating; an existing pakem is
              edited directly, and re-extracting would discard hand edits. */}
          {draftId === 'new' && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1 text-[11px] font-medium text-text">
                <ClipboardPaste size={12} aria-hidden /> Paste script contohnya, atau upload dokumen
              </p>
              <textarea
                value={pasted} onChange={(e) => setPasted(e.target.value)} rows={5}
                placeholder="Paste satu naskah utuh yang udah di-approve klien…"
                aria-label="Script contoh"
                className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={busy !== null || !pasted.trim()}
                  onClick={() => runExtract({ text: pasted })}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-onPrimary hover:opacity-90 disabled:opacity-50 cursor-pointer">
                  {busy === 'extract' ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Sparkles size={13} aria-hidden />}
                  Bedah strukturnya
                </button>
                <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text hover:bg-muted">
                  <Upload size={12} aria-hidden /> Upload PDF/DOCX
                  <input type="file" accept=".pdf,.docx,.txt,.md" className="hidden" disabled={busy !== null}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) extractFromFile(f); e.target.value = '' }} />
                </label>
              </div>
            </div>
          )}

          {notice && <p className="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[11px] text-primary">{notice}</p>}

          <div className="space-y-2.5 border-t border-border pt-2.5">
            <Field label="Alur section" hint="Urutan beat, pisahkan pakai koma">
              <input
                value={draft.section_flow.join(', ')}
                onChange={(e) => setField('section_flow', e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20))}
                placeholder="hook, masalah, solusi, bukti, cta" aria-label="Alur section"
                className={inputCls}
              />
            </Field>

            <Field label="Jumlah shot" hint="Kosongin salah satu kalau gak mau dibatasi">
              <div className="flex items-center gap-2">
                <NumBox value={draft.shot_min} onChange={(v) => setField('shot_min', v)} label="Minimal shot" placeholder="min" />
                <span className="text-xs text-mutedText">—</span>
                <NumBox value={draft.shot_max} onChange={(v) => setField('shot_max', v)} label="Maksimal shot" placeholder="max" />
                <span className="text-[11px] text-mutedText">
                  {formatShotRange(draft) || 'bebas'}
                </span>
              </div>
            </Field>

            <Field label="Gaya hook"><textarea value={draft.hook_style} onChange={(e) => setField('hook_style', e.target.value)} rows={2} aria-label="Gaya hook" className={inputCls} /></Field>
            <Field label="Gaya CTA"><textarea value={draft.cta_style} onChange={(e) => setField('cta_style', e.target.value)} rows={2} aria-label="Gaya CTA" className={inputCls} /></Field>
            <Field label="Pacing / panjang kalimat"><textarea value={draft.pacing} onChange={(e) => setField('pacing', e.target.value)} rows={2} aria-label="Pacing" className={inputCls} /></Field>

            <Field label="Aturan tambahan" hint="Satu aturan per baris">
              <textarea value={draft.extra_rules} onChange={(e) => setField('extra_rules', e.target.value)} rows={3} aria-label="Aturan tambahan" className={`${inputCls} font-data`} />
            </Field>

            <Field label="Tipe konten pakem ini" hint="Cuma dipakai buat ngasih peringatan kalau bentrok pas generate">
              <select value={draft.detected_format || ''} onChange={(e) => setField('detected_format', e.target.value || null)}
                aria-label="Tipe konten pakem" className={inputCls}>
                <option value="">— gak ditentukan —</option>
                {CONTENT_FORMAT_PRESETS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </Field>

            <Field label="Contoh gaya bicara" hint="1-2 baris aja — dipakai buat ritme, bukan buat dicontek isinya">
              <textarea value={draft.voice_sample} onChange={(e) => setField('voice_sample', e.target.value)} rows={2} aria-label="Contoh gaya bicara" className={inputCls} />
            </Field>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy !== null}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary py-1.5 text-xs font-medium text-onPrimary hover:opacity-90 disabled:opacity-50 cursor-pointer">
              {busy === 'save' ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Save size={13} aria-hidden />}
              Simpan pakem
            </button>
            <button type="button" onClick={closeDraft}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-muted cursor-pointer">Batal</button>
          </div>
        </div>
      )}
    </div>
  )
}

const inputCls = 'w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium text-text">
        {label}{hint && <span className="ml-1 font-normal text-mutedText">— {hint}</span>}
      </span>
      {children}
    </div>
  )
}

function NumBox({ value, onChange, label, placeholder }: {
  value: number | null; onChange: (v: number | null) => void; label: string; placeholder: string
}) {
  return (
    <input
      type="number" min={1} max={100} value={value ?? ''} placeholder={placeholder} aria-label={label}
      onChange={(e) => {
        const n = parseInt(e.target.value, 10)
        onChange(Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : null)
      }}
      className="w-20 rounded-md border border-border bg-background px-2 py-1 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
    />
  )
}
