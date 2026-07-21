'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, ClipboardPaste, FileText, X, FileInput, Loader2, ChevronDown } from 'lucide-react'
import { uploadFileForImport, MAX_IMPORT_UPLOAD_BYTES } from '@/lib/cakgpt/upload-client'

type PreviewNaskah = {
  _id: string
  title: string
  body: unknown[] // opaque block list — only its length is shown in the preview
}

export function NaskahImport({ clients, personas }: {
  clients: Array<{ id: string; name: string }>
  personas: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'file' | 'text' | 'gdoc'>('file')
  const [text, setText] = useState('')
  const [gdoc, setGdoc] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)

  const [extracting, setExtracting] = useState(false)
  const [naskah, setNaskah] = useState<PreviewNaskah[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [personaId, setPersonaId] = useState('')
  const [clientId, setClientId] = useState('')
  const [batchName, setBatchName] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)

  async function extract() {
    setExtracting(true); setError(null); setProgress(null)
    try {
      let res: Response
      if (mode === 'file') {
        const file = fileRef.current?.files?.[0]
        if (!file) { setError('pick a file first'); return }
        // Upload straight to Supabase Storage (browser → Storage, never
        // through our Vercel function) so large files skip Vercel's hard
        // 4.5 MB request-body cap entirely.
        setProgress('Uploading file…')
        const uploaded = await uploadFileForImport(file)
        if (!uploaded.ok) { setError(uploaded.error); return }
        setProgress('Extracting…')
        res = await fetch('/api/scriptwriter/naskah/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storage_path: uploaded.path }),
        })
      } else {
        const payload = mode === 'gdoc' ? { google_doc: gdoc } : { text }
        res = await fetch('/api/scriptwriter/naskah/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      }

      let data: { ok?: boolean; error?: string; naskah?: unknown[] }
      try {
        data = await res.json()
      } catch {
        // Response wasn't valid JSON — a platform-level rejection (e.g. a
        // gateway timeout) that never reached our route handler.
        setError(`Server error (status ${res.status}) — coba lagi.`)
        return
      }
      if (!data.ok) {
        if (res.status === 428) { setError('Google not connected.'); window.open('/api/integrations/google/auth', '_blank', 'noopener,noreferrer') }
        else setError(data.error || 'extraction failed')
        return
      }
      // Defensively normalize the response shape — a malformed item must not
      // crash the dashboard render (body is only ever read via .length).
      const list: PreviewNaskah[] = (Array.isArray(data.naskah) ? data.naskah : []).map((n) => {
        const item = n as { title?: string; body?: unknown[] }
        return {
          title: item.title ?? '',
          body: Array.isArray(item.body) ? item.body : [],
          _id: crypto.randomUUID(),
        }
      })
      setNaskah(list)
      setProgress(null)
    } catch (e) {
      setError(e instanceof Error && e.message ? `Network error: ${e.message}` : 'network error during extraction')
    } finally {
      setExtracting(false)
    }
  }

  function updateTitle(id: string, title: string) {
    setNaskah((prev) => prev && prev.map((n) => (n._id === id ? { ...n, title } : n)))
  }
  function removeNaskah(id: string) {
    setNaskah((prev) => prev && prev.filter((n) => n._id !== id))
  }
  function reset() {
    setNaskah(null); setText(''); setGdoc(''); setFileName(null); setBatchName(''); setError(null); setProgress(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function commit() {
    if (!naskah || naskah.length === 0) return
    if (!personaId) { setError('pick a persona — imported naskah need a voice profile (also used for QC)'); return }
    setImporting(true); setError(null); setProgress('Importing & running QC…')
    try {
      const payload = {
        persona_id: personaId,
        client_id: clientId || null,
        batch_name: batchName.trim() || undefined,
        naskah: naskah.map(({ _id, ...n }) => { void _id; return n }),
      }
      const res = await fetch('/api/scriptwriter/naskah/import/commit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error || 'import failed'); return }
      // Clear the preview before the (non-blocking) route transition so the
      // Import button can't be clicked a second time during navigation — a
      // double-submit would create a duplicate batch.
      setNaskah(null)
      router.push(`/studio/script/batches/${data.batch_id}`)
    } catch {
      setError('network error during import')
    } finally {
      setImporting(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-text hover:bg-muted cursor-pointer">
        <FileInput size={16} aria-hidden /> Import existing naskah
      </button>
    )
  }

  const disabled = importing

  return (
    <div className="w-full max-w-xl space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text">Import existing naskah</h2>
          <p className="mt-0.5 text-xs text-mutedText">Drop a docx/pdf/txt of finished scripts — AI splits it into naskah (words preserved) → QC → a new batch.</p>
        </div>
        <button onClick={() => { reset(); setOpen(false) }} aria-label="Close" className="rounded p-1 text-mutedText hover:bg-muted hover:text-text cursor-pointer">
          <ChevronDown size={16} aria-hidden />
        </button>
      </div>

      {naskah === null && (
        <>
          <div className="flex gap-1 rounded-md border border-border p-0.5">
            <button onClick={() => setMode('file')} disabled={extracting}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium cursor-pointer disabled:opacity-50 ${mode === 'file' ? 'bg-primary/10 text-primary' : 'text-mutedText hover:bg-muted'}`}>
              <Upload size={13} aria-hidden /> File
            </button>
            <button onClick={() => setMode('text')} disabled={extracting}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium cursor-pointer disabled:opacity-50 ${mode === 'text' ? 'bg-primary/10 text-primary' : 'text-mutedText hover:bg-muted'}`}>
              <ClipboardPaste size={13} aria-hidden /> Paste
            </button>
            <button onClick={() => setMode('gdoc')} disabled={extracting}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium cursor-pointer disabled:opacity-50 ${mode === 'gdoc' ? 'bg-primary/10 text-primary' : 'text-mutedText hover:bg-muted'}`}>
              <FileText size={13} aria-hidden /> Google Doc
            </button>
          </div>

          {mode === 'file' && (
            <div>
              <input ref={fileRef} type="file" accept=".docx,.pdf,.txt,.md,.xlsx,.xls,.csv" disabled={extracting}
                onChange={(e) => setFileName(e.target.files?.[0]?.name || null)}
                className="block w-full text-xs text-mutedText file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-text hover:file:bg-border" />
              {fileName && <p className="mt-1 truncate text-xs text-mutedText">Selected: {fileName}</p>}
              <p className="mt-1 text-[11px] text-mutedText">Maks {MAX_IMPORT_UPLOAD_BYTES / 1024 / 1024} MB. File gede banget? Pakai tab Paste atau Google Doc.</p>
            </div>
          )}
          {mode === 'text' && (
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Paste your naskah here (one or many)…" disabled={extracting}
              className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
          )}
          {mode === 'gdoc' && (
            <div>
              <input value={gdoc} onChange={(e) => setGdoc(e.target.value)} placeholder="Google Doc URL or id" disabled={extracting}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
              <p className="mt-1 text-[11px] text-mutedText">Needs your Google account connected. Reads the doc’s naskah into the platform.</p>
            </div>
          )}

          <button onClick={extract} disabled={extracting}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-sm font-medium text-onPrimary hover:opacity-90 disabled:opacity-50 cursor-pointer">
            {extracting ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Reading & splitting…</> : 'Extract naskah'}
          </button>
        </>
      )}

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {progress && <p className="text-xs text-mutedText">{progress}</p>}

      {naskah !== null && naskah.length === 0 && (
        <div className="space-y-2 rounded-md border border-dashed border-border p-4 text-center">
          <p className="text-sm text-mutedText">No naskah found in that document.</p>
          <button onClick={reset} className="text-xs font-medium text-primary hover:underline cursor-pointer">Start over</button>
        </div>
      )}

      {naskah !== null && naskah.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text">{naskah.length} naskah found — review before importing</span>
            <button onClick={reset} disabled={disabled} className="text-xs text-mutedText hover:text-text hover:underline disabled:opacity-50 cursor-pointer">Start over</button>
          </div>

          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {naskah.map((n) => (
              <div key={n._id} className="flex items-center gap-1.5 rounded-md border border-border bg-background p-2">
                <input value={n.title} onChange={(e) => updateTitle(n._id, e.target.value)} disabled={disabled} aria-label="Naskah title"
                  className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-text hover:border-border focus:border-primary focus:bg-surface focus:outline-none disabled:opacity-60" />
                <span className="shrink-0 font-data text-[11px] text-mutedText">{n.body.length} blocks</span>
                <button onClick={() => removeNaskah(n._id)} disabled={disabled} aria-label="Remove naskah" className="shrink-0 rounded p-1 text-mutedText hover:bg-muted hover:text-destructive disabled:opacity-50 cursor-pointer">
                  <X size={13} aria-hidden />
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label htmlFor="ni-persona" className="mb-1 block text-xs font-medium text-text">Persona <span className="text-destructive">*</span></label>
              <select id="ni-persona" value={personaId} onChange={(e) => setPersonaId(e.target.value)} disabled={disabled}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60">
                <option value="">— pick a voice —</option>
                {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ni-client" className="mb-1 block text-xs font-medium text-text">Client / brand</label>
              <select id="ni-client" value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={disabled}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60">
                <option value="">— none —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <input value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="Batch name (optional)" disabled={disabled}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />

          <button onClick={commit} disabled={disabled || !personaId}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent py-2 text-sm font-medium text-onPrimary hover:opacity-90 disabled:opacity-50 cursor-pointer">
            {importing ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Importing…</> : `Import ${naskah.length} naskah → new batch`}
          </button>
        </div>
      )}
    </div>
  )
}
