'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, ClipboardPaste, FileText, X, Sparkles, Loader2, ExternalLink } from 'lucide-react'
import { uploadFileForImport, MAX_IMPORT_UPLOAD_BYTES } from '@/lib/cakgpt/upload-client'
import { MAX_DAY_TOTAL, MAX_FANOUT_ITEMS, MAX_SOURCES } from '@/lib/cakgpt/schemas'

type PreviewBrief = {
  _id: string // stable client-side key (extraction time), never sent to the server
  title: string
  product?: string | null
  platform?: string | null
  cluster?: string | null
  fields: Record<string, string>
}

type SourceMode = 'file' | 'text' | 'gdoc'

export function BriefImport({ clients, personas }: {
  clients: Array<{ id: string; name: string }>
  personas: Array<{ id: string; name: string; cluster: string | null }>
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<SourceMode>('file')
  const [text, setText] = useState('')
  const [gdoc, setGdoc] = useState('')
  const [hint, setHint] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)

  // Hook bank (the writer's own opening lines) + what each uploaded file was
  // detected as, so a wrong guess is visible and correctable instead of silent.
  const [hooks, setHooks] = useState<Array<{ cluster: string | null; text: string }>>([])
  const [detected, setDetected] = useState<Array<{ filename: string; role: string }>>([])
  // Kept OUT of `error`: the briefs did extract fine, so this must not render
  // as the same red "the whole import failed" banner and scare the writer off
  // reviewing them.
  const [hookNotice, setHookNotice] = useState<string | null>(null)
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
  // Multi-day fan-out: how many naskah to generate per (brief × persona).
  // 1 = the original behavior.
  const [days, setDays] = useState(1)
  // Once committed, hold {id, cluster} PAIRS from the commit response — not
  // re-derived by re-indexing into local `briefs` state — so a later step
  // failing (batch/generate) and the writer editing/removing rows before
  // "Retry generate" can never desync an id from the wrong brief's cluster.
  const [committedBriefs, setCommittedBriefs] = useState<Array<{ id: string; cluster: string | null }> | null>(null)
  const [createdBatchId, setCreatedBatchId] = useState<string | null>(null)

  async function extract() {
    setExtracting(true)
    setError(null)
    setProgress(null)
    try {
      let res: Response
      if (mode === 'file') {
        const picked = Array.from(fileRef.current?.files || [])
        if (picked.length === 0) { setError('pick a file first'); return }
        // Refuse the extra files here — uploading them first only to have the
        // server drop the tail wastes time and storage with no feedback.
        if (picked.length > MAX_SOURCES) { setError(`Kebanyakan file (${picked.length}) — maks ${MAX_SOURCES} sekali import.`); return }
        // Upload straight to Supabase Storage (browser → Storage, never
        // through our Vercel function) so large files skip Vercel's hard
        // 4.5 MB request-body cap entirely. Multiple files are allowed so the
        // content plan and the hook bank can go in together; the server works
        // out which is which (and says so in the preview).
        const uploadedSources: Array<{ storage_path: string; filename: string }> = []
        for (let i = 0; i < picked.length; i++) {
          setProgress(picked.length > 1 ? `Uploading file ${i + 1}/${picked.length}…` : 'Uploading file…')
          const uploaded = await uploadFileForImport(picked[i])
          if (!uploaded.ok) { setError(`${picked[i].name}: ${uploaded.error}`); return }
          uploadedSources.push({ storage_path: uploaded.path, filename: picked[i].name })
        }
        setProgress('Extracting…')
        res = await fetch('/api/scriptwriter/briefs/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sources: uploadedSources, hint }),
        })
      } else {
        const payload = mode === 'text' ? { text, hint } : { google_doc: gdoc, hint }
        res = await fetch('/api/scriptwriter/briefs/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
      }

      let data: {
        ok?: boolean; error?: string; briefs?: Omit<PreviewBrief, '_id'>[]
        hooks?: Array<{ cluster: string | null; text: string }>; hook_error?: string | null
        sources?: Array<{ filename: string; role: string }>
      }
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
        // The server reports which file it read as what even when the import
        // fails (e.g. every file landed as a hook bank) — showing it here is
        // the difference between "I forgot the plan" and "detection misfired".
        setDetected(data.sources || [])
        return
      }
      const list: PreviewBrief[] = (data.briefs || []).map((b) => ({ ...b, _id: crypto.randomUUID() }))
      setBriefs(list) // may be [] — the empty-state branch handles that
      setHooks(data.hooks || [])
      setDetected(data.sources || [])
      // Hook extraction is best-effort server-side. Surface it as a NOTICE, not
      // an error — the briefs are fine and still worth importing.
      setHookNotice(data.hook_error ? `Hook bank nggak kebaca: ${data.hook_error} — brief tetap bisa diimport, tapi hook-nya nggak kepake.` : null)
      setCommittedBriefs(null)
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
  function updateCluster(id: string, cluster: string) {
    setBriefs((prev) => prev && prev.map((b) => (b._id === id ? { ...b, cluster: cluster || null } : b)))
  }

  const clampDays = (d: number) => Math.max(1, Math.min(MAX_DAY_TOTAL, d))

  // Personas grouped by cluster — needed both to project the fan-out size
  // BEFORE committing and to resolve the real items after.
  function buildPersonasByCluster(): Map<string, string[]> {
    const map = new Map<string, string[]>()
    for (const p of personas) {
      if (!p.cluster) continue
      const key = p.cluster.trim().toLowerCase()
      const list = map.get(key) || []
      list.push(p.id)
      map.set(key, list)
    }
    return map
  }

  // How many personas a brief with this cluster will actually fan out to —
  // mirrors the resolution order used when building the real items.
  function personasForCluster(cluster: string | null | undefined, byCluster: Map<string, string[]>): number {
    const key = cluster?.trim().toLowerCase()
    const clusterMatches = key ? byCluster.get(key) || [] : []
    const checkedMatches = selectedPersonaIds.filter((id) => clusterMatches.includes(id))
    if (checkedMatches.length > 0) return checkedMatches.length
    if (selectedPersonaIds.length > 0) return selectedPersonaIds.length
    if (clusterMatches.length > 0) return clusterMatches.length
    return 1
  }

  // Exact projected naskah count. Computed from the PREVIEW briefs so an
  // over-cap run is refused BEFORE anything is committed — otherwise the
  // briefs and batch are already persisted when the server rejects the
  // oversized payload, leaving the writer with orphaned rows and a vague
  // "network error" (a payload this large can exceed the request body limit
  // before the route's own friendly cap message can even run).
  function projectedNaskahCount(list: PreviewBrief[]): number {
    const byCluster = buildPersonasByCluster()
    const dayTotal = clampDays(days)
    return list.reduce((sum, b) => sum + personasForCluster(b.cluster, byCluster) * dayTotal, 0)
  }
  function removeBrief(id: string) {
    setBriefs((prev) => prev && prev.filter((b) => b._id !== id))
  }
  function reset() {
    setBriefs(null); setText(''); setGdoc(''); setHint(''); setFileName(null); setSelectedPersonaIds([])
    setCommittedBriefs(null); setCreatedBatchId(null); setError(null); setProgress(null); setSteering(''); setDays(1)
    setHooks([]); setDetected([]); setHookNotice(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // POST the reviewed briefs (stripping the client-only _id). Returns each
  // committed row's {id, cluster} (from the SAME insert response row — never
  // re-derived by re-indexing local state) or null on failure.
  async function commitBriefs(list: PreviewBrief[]): Promise<Array<{ id: string; cluster: string | null }> | null> {
    const payloadBriefs = list.map(({ _id, ...b }) => { void _id; return b })
    const importLabel = fileName || `Content plan ${new Date().toLocaleDateString('id-ID')}`
    const res = await fetch('/api/scriptwriter/briefs/import/commit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ briefs: payloadBriefs, client_id: clientId || null, status, import_label: importLabel }),
    })
    const data = await res.json()
    if (!data.ok) { setError(data.error || 'failed to save briefs'); return null }
    return data.briefs as Array<{ id: string; cluster: string | null }>
  }

  // Commit once; reuse the result if a prior attempt already committed it —
  // so editing/removing rows afterward (e.g. before a "Retry generate") can
  // never desync from what was actually persisted.
  async function ensureCommitted(list: PreviewBrief[]): Promise<Array<{ id: string; cluster: string | null }> | null> {
    if (committedBriefs) return committedBriefs
    const committed = await commitBriefs(list)
    if (committed) setCommittedBriefs(committed)
    return committed
  }

  async function importOnly() {
    if (!briefs || briefs.length === 0) return
    setBusy('commit'); setError(null); setProgress(null)
    try {
      const committed = await ensureCommitted(briefs)
      if (!committed) return
      setProgress(`Imported ${committed.length} briefs.`)
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

    // Pre-flight, BEFORE anything is persisted (see projectedNaskahCount).
    const projected = projectedNaskahCount(briefs)
    if (projected > MAX_FANOUT_ITEMS) {
      setError(
        `Kebanyakan: ${projected.toLocaleString('id-ID')} naskah sekali jalan (maks ${MAX_FANOUT_ITEMS.toLocaleString('id-ID')}). ` +
        `Kurangi jumlah hari (sekarang ${clampDays(days)}), persona yang dicentang, atau brief-nya — atau import bertahap.`,
      )
      return
    }

    setBusy('generate'); setError(null); setProgress(null)
    try {
      const committed = await ensureCommitted(briefs)
      if (!committed) return

      // Reuse an already-created batch on retry rather than making a second one.
      let batchId = createdBatchId
      if (!batchId) {
        setProgress('Creating batch…')
        const batchRes = await fetch('/api/scriptwriter/batches', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          // hook_bank rides on the batch: it applies to this import's run only.
          body: JSON.stringify({
            name: `Content plan ${new Date().toLocaleDateString('id-ID')}`,
            client_id: clientId || null,
            hook_bank: hooks.length > 0 ? hooks : undefined,
          }),
        })
        const batchData = await batchRes.json()
        if (!batchData.ok) { setError(`${batchData.error || 'failed to create batch'} — briefs were saved; retry to continue.`); return }
        batchId = batchData.batch.id as string
        setCreatedBatchId(batchId)
      }

      // Cluster-aware fan-out — the bug this replaces: naively crossing every
      // brief against every checked persona regardless of audience fit (a Dad
      // persona voicing a "Nutrition Mom Hook" brief). Reads cluster from
      // `committed` (each {id, cluster} pair came back from the SAME commit
      // response row) — NEVER by re-indexing local `briefs` state, which can
      // have been edited/reordered/had rows removed by the writer between a
      // failed step and clicking "Retry generate" (busy re-enables the review
      // list's edit controls on failure; committed stays cached from the
      // original successful commit either way). Resolution per brief, most
      // specific first:
      //   1. checked personas whose cluster matches this brief's cluster
      //   2. no cluster info to filter by -> whatever was checked (unchanged
      //      behavior, so briefs without a cluster tag never get silently skipped)
      //   3. nothing checked, but the cluster resolves to known persona(s) ->
      //      auto-use them (this is what "no persona specified (brief has no
      //      default persona)" used to hard-fail on)
      //   4. null -> server falls back to the brief's own persona_id (commit
      //      already tried to resolve that from cluster too; may still be empty)
      const personasByCluster = buildPersonasByCluster()
      const arahan = steering.trim() || undefined
      const dayTotal = clampDays(days)
      const items: Array<{ brief_id: string; persona_id: string | null; extra_context?: string; day_no?: number; day_total?: number }> = []
      for (const { id: briefId, cluster } of committed) {
        const clusterKey = cluster?.trim().toLowerCase()
        const clusterMatches = clusterKey ? personasByCluster.get(clusterKey) || [] : []
        const checkedMatches = selectedPersonaIds.filter((id) => clusterMatches.includes(id))
        const resolved: Array<string | null> =
          checkedMatches.length > 0 ? checkedMatches
          : selectedPersonaIds.length > 0 ? selectedPersonaIds
          : clusterMatches.length > 0 ? clusterMatches
          : [null]
        for (const personaId of resolved) {
          // Third dimension: one naskah per day for this (brief × persona).
          // dayTotal === 1 sends no day fields at all, so a single-day run is
          // byte-identical to the pre-feature payload.
          if (dayTotal === 1) {
            items.push({ brief_id: briefId, persona_id: personaId, extra_context: arahan })
          } else {
            for (let d = 1; d <= dayTotal; d++) {
              items.push({ brief_id: briefId, persona_id: personaId, extra_context: arahan, day_no: d, day_total: dayTotal })
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
              <input ref={fileRef} type="file" multiple accept=".xlsx,.xls,.csv,.pdf,.docx,.txt,.md" disabled={extracting}
                onChange={(e) => {
                  const names = Array.from(e.target.files || []).map((f) => f.name)
                  setFileName(names.length ? names.join(', ') : null)
                }}
                className="block w-full text-xs text-mutedText file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-text hover:file:bg-border" />
              {fileName && <p className="mt-1 truncate text-xs text-mutedText">Selected: {fileName}</p>}
              <p className="mt-1 text-[11px] text-mutedText">
                Bisa pilih lebih dari 1 file: content plan + hook bank sekaligus — sistem ndeteksi sendiri mana yang mana (hasil deteksinya ditampilin, bisa dikoreksi).
              </p>
              <p className="mt-1 text-[11px] text-mutedText">Maks {MAX_IMPORT_UPLOAD_BYTES / 1024 / 1024} MB per file. File PDF gede banget (banyak gambar/screenshot)? Pakai tab Paste atau Google Doc.</p>
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

      {/* Detection breakdown also renders when the import FAILED (e.g. every
          file was read as a hook bank), which is exactly when it's needed. */}
      {briefs === null && detected.length > 0 && (
        <ul className="space-y-0.5">
          {detected.map((d, i) => (
            <li key={i} className="flex items-center gap-1.5 text-[11px] text-mutedText">
              <span className={`rounded px-1.5 py-0.5 font-medium ${d.role === 'hooks' ? 'bg-accent/15 text-accent' : 'bg-primary/10 text-primary'}`}>
                {d.role === 'hooks' ? 'Hook bank' : 'Topik'}
              </span>
              <span className="truncate">{d.filename}</span>
            </li>
          ))}
        </ul>
      )}

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

          {/* What each uploaded file was read as. Shown whenever more than one
              file was sent so a wrong guess is caught before generating. */}
          {detected.length > 1 && (
            <div className="rounded-md border border-border bg-background p-2">
              <p className="mb-1 text-[11px] font-medium text-text">File kebaca sebagai:</p>
              <ul className="space-y-0.5">
                {detected.map((d, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-[11px] text-mutedText">
                    <span className={`rounded px-1.5 py-0.5 font-medium ${d.role === 'hooks' ? 'bg-accent/15 text-accent' : 'bg-primary/10 text-primary'}`}>
                      {d.role === 'hooks' ? 'Hook bank' : 'Topik'}
                    </span>
                    <span className="truncate">{d.filename}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[10px] text-mutedText">Kebalik? Klik “Start over”, terus rename file-nya (kasih kata “hook” di nama file hook bank) dan upload ulang.</p>
            </div>
          )}

          {hookNotice && (
            <p className="rounded-md border border-warning/30 bg-warning/[0.06] px-2 py-1.5 text-[11px] text-warning">{hookNotice}</p>
          )}

          {hooks.length > 0 && (() => {
            // Group for display + coverage check. A persona draws only from its
            // OWN cluster (plus untagged hooks), so a cluster holding fewer
            // hooks than `days` will wrap and repeat within that series — worth
            // flagging here, while adding hooks is still easy.
            const untagged = hooks.filter((h) => !h.cluster).length
            const byCluster = new Map<string, number>()
            for (const h of hooks) {
              if (!h.cluster) continue
              const k = h.cluster.trim()
              byCluster.set(k, (byCluster.get(k) || 0) + 1)
            }
            const thin = [...byCluster.entries()].filter(([, n]) => n + untagged < days)
            return (
              <div className="rounded-md border border-accent/30 bg-accent/[0.05] p-2">
                <p className="text-[11px] font-medium text-text">
                  Hook bank: {hooks.length} hook kebaca — dipakai buat batch ini aja
                </p>
                {byCluster.size > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {[...byCluster.entries()].map(([c, n]) => (
                      <span key={c} className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">{c}: {n}</span>
                    ))}
                    {untagged > 0 && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-mutedText" title="Hook tanpa cluster — kepake buat semua persona">
                        tanpa cluster: {untagged}
                      </span>
                    )}
                  </div>
                )}
                <p className="mt-1 line-clamp-2 text-[11px] text-mutedText">
                  mis. {hooks.slice(0, 2).map((h) => `“${h.text.length > 60 ? h.text.slice(0, 60) + '…' : h.text}”`).join(' · ')}
                </p>
                {days > 1 && thin.length > 0 && (
                  <p className="mt-1 text-[11px] text-warning">
                    Hook kurang buat {days} hari di cluster: {thin.map(([c, n]) => `${c} (${n + untagged})`).join(', ')} — hari berikutnya bakal ngulang hook yang sama.
                  </p>
                )}
              </div>
            )
          })()}

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
                <div className="mt-1 flex items-center gap-1 px-1">
                  <span className="text-[10px] text-mutedText">Cluster:</span>
                  <input value={b.cluster || ''} onChange={(e) => updateCluster(b._id, e.target.value)} disabled={disabled}
                    placeholder="— (nggak ke-detect, isi manual biar generate ke persona yang cocok)"
                    aria-label="Brief cluster"
                    className="w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-text hover:border-border focus:border-primary focus:bg-surface focus:outline-none disabled:opacity-60" />
                </div>
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
                    {p.cluster && <span className="text-[10px] text-mutedText">({p.cluster})</span>}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="import-days" className="mb-1 block text-xs font-medium text-text">
              Hari per topik <span className="font-normal text-mutedText">(1 = satu naskah per persona)</span>
            </label>
            <input
              id="import-days" type="number" min={1} max={MAX_DAY_TOTAL} value={days} disabled={disabled}
              onChange={(e) => setDays(clampDays(parseInt(e.target.value, 10) || 1))}
              className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
            />
            <p className="mt-1 text-[11px] text-mutedText">
              Isi &gt;1 buat garap satu topik selama beberapa hari. Yang bikin tiap hari beda diambil dari isi brief + Arahan di bawah — tulis aja rencana per-harinya di situ.
            </p>
          </div>

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
              {busy === 'commit' ? 'Importing…' : committedBriefs ? `Imported ✓` : `Import ${briefs.length} briefs`}
            </button>
            <button onClick={importAndGenerate} disabled={disabled}
              title="Create the briefs, then fan out into naskah (brief × persona) in one batch"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent py-2 text-sm font-medium text-onPrimary hover:opacity-90 disabled:opacity-50 cursor-pointer">
              {busy === 'generate' ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Working…</> : committedBriefs ? 'Retry generate' : 'Import & Generate'}
            </button>
          </div>
          <p className="text-[11px] text-mutedText">
            {selectedPersonaIds.length > 0
              ? `Import & Generate → tiap brief dipasangin persona yang lu centang DAN cluster-nya cocok (kalau ada cluster match). Brief tanpa cluster match tetap dapet semua ${selectedPersonaIds.length} persona yang dicentang.`
              : 'Import & Generate → pakai persona yang cluster-nya cocok sama brief (kalau ke-detect), atau default persona brief (pick personas above buat override manual).'}
            {days > 1 && ` Tiap pasangan digenerate ${days} kali (hari 1–${days}).`}
          </p>
          {(() => {
            const projected = projectedNaskahCount(briefs)
            const over = projected > MAX_FANOUT_ITEMS
            return (
              <p className={`text-[11px] font-medium ${over ? 'text-destructive' : 'text-mutedText'}`}>
                Perkiraan hasil: {projected.toLocaleString('id-ID')} naskah
                {over && ` — lewat batas ${MAX_FANOUT_ITEMS.toLocaleString('id-ID')}/run, kurangi hari/persona/brief dulu`}
              </p>
            )
          })()}
        </div>
      )}
    </div>
  )
}
