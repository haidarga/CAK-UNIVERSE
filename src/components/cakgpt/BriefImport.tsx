'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, ClipboardPaste, FileText, X, Sparkles, Loader2, ExternalLink } from 'lucide-react'
import { uploadFileForImport, MAX_IMPORT_UPLOAD_BYTES } from '@/lib/cakgpt/upload-client'

type PreviewBrief = {
  _id: string // stable client-side key (extraction time), never sent to the server
  title: string
  product?: string | null
  platform?: string | null
  fields: Record<string, string>
}

type SourceMode = 'file' | 'text' | 'gdoc'

export function BriefImport({ clients, personas }: {
  clients: Array<{ id: string; name: string }>
  personas: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<SourceMode>('file')
  const [text, setText] = useState('')
  const [gdoc, setGdoc] = useState('')
  const [hint, setHint] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)

  const [extracting, setExtracting] = useState(false)
  const [briefs, setBriefs] = useState<PreviewBrief[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [clientId, setClientId] = useState('')
  const [status, setStatus] = useState<'ready' | 'draft'>('ready')
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([])
  const [busy, setBusy] = useState<null | 'commit' | 'generate'>(null)
  const [progress, setProgress] = useState<string | null>(null)
  // Optional writer steering ("arahan") applied to the whole fan-out on
  // Import & Generate — empty = plain direct generate (unchanged behavior).
  const [steering, setSteering] = useState('')
  // Once committed, hold the ids so a later step failing (batch/generate) never
  // re-commits the same briefs on retry.
  const [committedIds, setCommittedIds] = useState<string[] | null>(null)
  const [createdBatchId, setCreatedBatchId] = useState<string | null>(null)

  async function extract() {
    setExtracting(true)
    setError(null)
    setProgress(null)
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
        res = await fetch('/api/scriptwriter/briefs/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storage_path: uploaded.path, hint }),
        })
      } else {
        const payload = mode === 'text' ? { text, hint } : { google_doc: gdoc, hint }
        res = await fetch('/api/scriptwriter/briefs/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
      }

      let data: { ok?: boolean; error?: string; briefs?: Omit<PreviewBrief, '_id'>[] }
      try {
        data = await res.json()
      } catch {
        // Response wasn't valid JSON — a platform-level rejection (e.g. a
        // gateway timeout) that never reached our route handler. Surface the
        // real HTTP status instead of a dead-end message.
        setError(`Server error (status ${res.status}) — coba lagi.`)
        return
      }
      if (!data.ok) {
        if (res.status === 428) { setError('Google not connected.'); window.open('/api/integrations/google/auth', '_blank', 'noopener,noreferrer') }
        else setError(data.error || 'extraction failed')
        return
      }
      const list: PreviewBrief[] = (data.briefs || []).map((b) => ({ ...b, _id: crypto.randomUUID() }))
      setBriefs(list) // may be [] — the empty-state branch handles that
      setCommittedIds(null)
      setCreatedBatchId(null)
      setProgress(null)
    } catch (e) {
      setError(e instanceof Error && e.message ? `Network error: ${e.message}` : 'network error during extraction')
    } finally {
      setExtracting(false)
    }
  }

  function updateTitle(id: string, title: string) {
    setBriefs((prev) => prev && prev.map((b) => (b._id === id ? { ...b, title } : b)))
  }
  function removeBrief(id: string) {
    setBriefs((prev) => prev && prev.filter((b) => b._id !== id))
  }
  function reset() {
    setBriefs(null); setText(''); setGdoc(''); setHint(''); setFileName(null); setSelectedPersonaIds([])
    setCommittedIds(null); setCreatedBatchId(null); setError(null); setProgress(null); setSteering('')
    if (fileRef.current) fileRef.current.value = ''
  }

  // POST the reviewed briefs (stripping the client-only _id). Returns ids or null.
  async function commitBriefs(list: PreviewBrief[]): Promise<string[] | null> {
    const payloadBriefs = list.map(({ _id, ...b }) => { void _id; return b })
    const importLabel = fileName || `Content plan ${new Date().toLocaleDateString('id-ID')}`
    const res = await fetch('/api/scriptwriter/briefs/import/commit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ briefs: payloadBriefs, client_id: clientId || null, status, import_label: importLabel }),
    })
    const data = await res.json()
    if (!data.ok) { setError(data.error || 'failed to save briefs'); return null }
    return data.brief_ids as string[]
  }

  // Commit once; reuse the ids if a prior attempt already committed them.
  async function ensureCommitted(list: PreviewBrief[]): Promise<string[] | null> {
    if (committedIds) return committedIds
    const ids = await commitBriefs(list)
    if (ids) setCommittedIds(ids)
    return ids
  }

  async function importOnly() {
    if (!briefs || briefs.length === 0) return
    setBusy('commit'); setError(null); setProgress(null)
    try {
      const ids = await ensureCommitted(briefs)
      if (!ids) return
      setProgress(`Imported ${ids.length} briefs.`)
      reset()
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  // Capstone: commit briefs → make a client-locked batch → fan out
  // (brief × persona) into naskah → land in the triage queue.
  async function importAndGenerate() {
    if (!briefs || briefs.length === 0) return
    setBusy('generate'); setError(null); setProgress(null)
    try {
      const ids = await ensureCommitted(briefs)
      if (!ids) return

      // Reuse an already-created batch on retry rather than making a second one.
      let batchId = createdBatchId
      if (!batchId) {
        setProgress('Creating batch…')
        const batchRes = await fetch('/api/scriptwriter/batches', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: `Content plan ${new Date().toLocaleDateString('id-ID')}`, client_id: clientId || null }),
        })
        const batchData = await batchRes.json()
        if (!batchData.ok) { setError(`${batchData.error || 'failed to create batch'} — briefs were saved; retry to continue.`); return }
        batchId = batchData.batch.id as string
        setCreatedBatchId(batchId)
      }

      const personaIds: Array<string | null> = selectedPersonaIds.length > 0 ? selectedPersonaIds : [null]
      const arahan = steering.trim() || undefined
      const items = ids.flatMap((briefId) => personaIds.map((personaId) => ({ brief_id: briefId, persona_id: personaId, extra_context: arahan })))

      setProgress(`Queueing ${items.length} naskah…`)
      const genRes = await fetch(`/api/scriptwriter/batches/${batchId}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
      })
      const genData = await genRes.json()
      if (!genData.ok) {
        // Don't navigate away — keep the error visible and offer a manual link
        // (briefs + batch already exist, so the user can open and retry there).
        setError(genData.error || 'failed to queue generation — briefs & batch were created.')
        return
      }
      // Enqueue is instant; the batch page drains the queue and shows progress.
      router.push(`/studio/script/batches/${batchId}`)
    } catch {
      setError('network error during import & generate')
    } finally {
      setBusy(null)
    }
  }

  const disabled = busy !== null
  const TABS: Array<{ id: SourceMode; label: string; icon: typeof Upload }> = [
    { id: 'file', label: 'File', icon: Upload },
    { id: 'text', label: 'Paste', icon: ClipboardPaste },
    { id: 'gdoc', label: 'Google Doc', icon: FileText },
  ]

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text"><Sparkles size={15} className="text-accent" aria-hidden /> Import content plan</h2>
        <p className="mt-0.5 text-xs text-mutedText">Drop a spreadsheet / PDF / Doc — AI splits it into briefs. Optionally generate naskah per persona in one shot.</p>
      </div>

      {briefs === null && (
        <>
          <div className="flex gap-1 rounded-md border border-border p-0.5">
            {TABS.map((t) => {
              const Icon = t.icon
              return (
                <button key={t.id} onClick={() => setMode(t.id)} disabled={extracting}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                    mode === t.id ? 'bg-primary/10 text-primary' : 'text-mutedText hover:bg-muted'
                  }`}>
                  <Icon size={13} aria-hidden /> {t.label}
                </button>
              )
            })}
          </div>

          {mode === 'file' && (
            <div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,.txt,.md" disabled={extracting}
                onChange={(e) => setFileName(e.target.files?.[0]?.name || null)}
                className="block w-full text-xs text-mutedText file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-text hover:file:bg-border" />
              {fileName && <p className="mt-1 truncate text-xs text-mutedText">Selected: {fileName}</p>}
              <p className="mt-1 text-[11px] text-mutedText">Maks {MAX_IMPORT_UPLOAD_BYTES / 1024 / 1024} MB. File PDF gede banget (banyak gambar/screenshot)? Pakai tab Paste atau Google Doc.</p>
            </div>
          )}
          {mode === 'text' && (
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Paste the content plan here…" disabled={extracting}
              className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
          )}
          {mode === 'gdoc' && (
            <div>
              <input value={gdoc} onChange={(e) => setGdoc(e.target.value)} placeholder="Google Doc URL or id" disabled={extracting}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
              <p className="mt-1 text-[11px] text-mutedText">Needs your Google account connected (Docs access).</p>
            </div>
          )}

          <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Optional hint for the AI (e.g. 'each row is one TikTok idea')" disabled={extracting}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />

          <button onClick={extract} disabled={extracting}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-sm font-medium text-onPrimary hover:opacity-90 disabled:opacity-50 cursor-pointer">
            {extracting ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Extracting…</> : 'Extract briefs'}
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
          {createdBatchId && (
            <a href={`/studio/script/batches/${createdBatchId}`} className="ml-1.5 inline-flex items-center gap-0.5 font-medium underline">
              <ExternalLink size={11} aria-hidden /> Open batch
            </a>
          )}
        </p>
      )}
      {progress && <p className="text-xs text-mutedText">{progress}</p>}

      {briefs !== null && briefs.length === 0 && (
        <div className="space-y-2 rounded-md border border-dashed border-border p-4 text-center">
          <p className="text-sm text-mutedText">No briefs found in that source.</p>
          <button onClick={reset} className="text-xs font-medium text-primary hover:underline cursor-pointer">Start over</button>
        </div>
      )}

      {briefs !== null && briefs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text">{briefs.length} briefs found — review before importing</span>
            <button onClick={reset} disabled={disabled} className="text-xs text-mutedText hover:text-text hover:underline disabled:opacity-50 cursor-pointer">Start over</button>
          </div>

          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {briefs.map((b) => (
              <div key={b._id} className="rounded-md border border-border bg-background p-2">
                <div className="flex items-start gap-1.5">
                  <input value={b.title} onChange={(e) => updateTitle(b._id, e.target.value)} disabled={disabled} aria-label="Brief title"
                    className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-text hover:border-border focus:border-primary focus:bg-surface focus:outline-none disabled:opacity-60" />
                  <button onClick={() => removeBrief(b._id)} disabled={disabled} aria-label="Remove brief" className="shrink-0 rounded p-1 text-mutedText hover:bg-muted hover:text-destructive disabled:opacity-50 cursor-pointer">
                    <X size={13} aria-hidden />
                  </button>
                </div>
                {(b.platform || b.product) && (
                  <p className="px-1 text-[11px] text-mutedText">{[b.platform, b.product].filter(Boolean).join(' · ')}</p>
                )}
                {Object.keys(b.fields).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 px-1">
                    {Object.entries(b.fields).slice(0, 5).map(([k, v]) => (
                      <span key={k} className="rounded bg-muted px-1.5 py-0.5 font-data text-[10px] text-mutedText" title={`${k}: ${v}`}>
                        <span className="font-medium text-text">{k}:</span> {v.length > 24 ? v.slice(0, 24) + '…' : v}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label htmlFor="import-client" className="mb-1 block text-xs font-medium text-text">Client / brand</label>
              <select id="import-client" value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={disabled}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60">
                <option value="">— none —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="import-status" className="mb-1 block text-xs font-medium text-text">Status</label>
              <select id="import-status" value={status} onChange={(e) => setStatus(e.target.value as 'ready' | 'draft')} disabled={disabled}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60">
                <option value="ready">ready (generatable)</option>
                <option value="draft">draft</option>
              </select>
            </div>
          </div>

          {personas.length > 0 && (
            <div>
              <span className="mb-1 block text-xs font-medium text-text">Generate naskah for personas <span className="font-normal text-mutedText">(optional)</span></span>
              <div className="flex flex-wrap gap-1.5">
                {personas.map((p) => (
                  <label key={p.id} className={`flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs text-text ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
                    <input type="checkbox" checked={selectedPersonaIds.includes(p.id)} disabled={disabled}
                      onChange={(e) => setSelectedPersonaIds(e.target.checked ? [...selectedPersonaIds, p.id] : selectedPersonaIds.filter((id) => id !== p.id))} />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-medium text-text">Arahan</span>
              <span className="text-[11px] text-mutedText">opsional — arahin gaya/angle/isi naskah. Kosongin = generate langsung.</span>
            </div>
            <textarea
              value={steering}
              onChange={(e) => setSteering(e.target.value)}
              disabled={disabled}
              maxLength={4000}
              rows={2}
              placeholder="mis. Bikin lebih santai & lucu, buka pakai pertanyaan, sisipin CTA follow di akhir, hindari kata 'guys'…"
              className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-text outline-none placeholder:text-mutedText focus:border-primary disabled:opacity-60"
            />
          </div>

          <div className="flex gap-2">
            <button onClick={importOnly} disabled={disabled}
              className="flex-1 rounded-md border border-border py-2 text-sm font-medium text-text hover:bg-muted disabled:opacity-50 cursor-pointer">
              {busy === 'commit' ? 'Importing…' : committedIds ? `Imported ✓` : `Import ${briefs.length} briefs`}
            </button>
            <button onClick={importAndGenerate} disabled={disabled}
              title="Create the briefs, then fan out into naskah (brief × persona) in one batch"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent py-2 text-sm font-medium text-onPrimary hover:opacity-90 disabled:opacity-50 cursor-pointer">
              {busy === 'generate' ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Working…</> : committedIds ? 'Retry generate' : 'Import & Generate'}
            </button>
          </div>
          <p className="text-[11px] text-mutedText">
            {selectedPersonaIds.length > 0
              ? `Import & Generate → ${briefs.length} briefs × ${selectedPersonaIds.length} personas = ${briefs.length * selectedPersonaIds.length} naskah`
              : 'Import & Generate uses each brief\'s default persona (pick personas above to fan out).'}
          </p>
        </div>
      )}
    </div>
  )
}
