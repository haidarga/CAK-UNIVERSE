'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, X, Sparkles, RefreshCw, FileUp, FileDown, ExternalLink, Pencil, Save, RotateCcw, ShieldCheck, ChevronDown, Link2 } from 'lucide-react'

type QueueItem = {
  naskah_id: string
  title: string | null
  status: string
  updated_at: string
  persona_name: string | null
  hook_type: string | null
  hook_name: string | null
  flag_counts: { blocker: number; warning: number; nit: number }
  has_open_blockers: boolean
}

type Block = {
  block_id: string
  section_key: string
  shot_no: number
  line_no: number
  speaker?: string | null
  timestamp_range?: string | null
  text: string
  visual_note?: string | null
}

type Flag = {
  id: string
  target_ref: { block_id: string; display_snapshot: { section_key: string; shot_no: number; line_no: number } }
  category: string
  severity: 'blocker' | 'warning' | 'nit'
  message: string
  evidence: string | null
  status: 'open' | 'resolved' | 'dismissed'
}

type NaskahDetail = {
  naskah: { id: string; title: string | null; status: string; current_version: { body: Block[]; hook_justification: string | null } }
  flags: Flag[]
}

const SEVERITY_STYLES: Record<string, string> = {
  blocker: 'bg-blocker/10 text-blocker border-blocker/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  nit: 'bg-nit/10 text-nit border-nit/30',
}

type DocRef = { doc_id: string; doc_url: string; last_pushed_at?: string; last_pulled_at?: string } | null

export function TriageQueue({ batchId, batchName, readyBriefs, personas, batchClientId, initialDocRef }: {
  batchId: string
  batchName: string
  readyBriefs: Array<{ id: string; title: string; client_id?: string | null }>
  personas: Array<{ id: string; name: string }>
  batchClientId: string | null
  initialDocRef: DocRef
}) {
  const [items, setItems] = useState<QueueItem[]>([])
  const [selected, setSelected] = useState(0)
  const [detail, setDetail] = useState<NaskahDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [threshold, setThreshold] = useState<'none' | 'blocker_only'>('none')
  const [selectedBriefIds, setSelectedBriefIds] = useState<string[]>([])
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState<string | null>(null)
  const [fanoutOpen, setFanoutOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [docRef, setDocRef] = useState<DocRef>(initialDocRef)
  const [docSyncing, setDocSyncing] = useState<'push' | 'pull' | null>(null)
  const [docStatus, setDocStatus] = useState<string | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkInput, setLinkInput] = useState('')
  const [linking, setLinking] = useState(false)

  // Background generation progress (jobs drain in chunks via /api/gen-jobs/process).
  const [genStatus, setGenStatus] = useState<{ active: number; done: number; failed: number; total: number } | null>(null)
  const pumpingRef = useRef(false)
  const pumpCancelRef = useRef(false)

  // Block-level editor state (decision #3). editedBlocks is a working copy of
  // the current version's body; block_ids are preserved so no QC flag orphans.
  const [editing, setEditing] = useState(false)
  const [editedBlocks, setEditedBlocks] = useState<Block[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [rerunning, setRerunning] = useState(false)

  // When the batch is locked to a client, only briefs of that client (or
  // unassigned) can be added without hitting the server's one-client guard.
  const visibleBriefs = batchClientId
    ? readyBriefs.filter((b) => !b.client_id || b.client_id === batchClientId)
    : readyBriefs

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/scriptwriter/triage/queue?batch_id=${batchId}`)
      const data = await res.json()
      if (data.ok) setItems(data.items)
      else setActionError(data.error || 'failed to load queue')
    } catch {
      setActionError('network error loading queue')
    } finally {
      setLoading(false)
    }
  }, [batchId])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  // Drain the batch's generation queue in small chunks, refreshing the triage
  // list each round so naskah appear as they're created. Idempotent — a second
  // caller no-ops (pumpingRef); the server-side claim is also concurrency-safe.
  const pump = useCallback(async () => {
    if (pumpingRef.current) return
    pumpingRef.current = true
    pumpCancelRef.current = false
    try {
      let stalls = 0
      for (;;) {
        if (pumpCancelRef.current) return // unmounted / batch changed — stop cleanly
        try {
          const res = await fetch('/api/scriptwriter/gen-jobs/process', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch_id: batchId }),
          })
          const data = await res.json()
          if (!data.ok) { setActionError(data.error || 'generation failed'); break }
          await fetchQueue()
          const st = await fetch(`/api/scriptwriter/batches/${batchId}/gen-status`).then((r) => r.json()).catch(() => null)
          if (st?.ok) setGenStatus({ active: st.active, done: st.done, failed: st.failed, total: st.total })
          const remaining = st?.ok ? st.active : (data.remaining ?? 0)
          if (remaining === 0) break
          if (data.claimed === 0) {
            // remaining jobs are 'running' under another pump — wait, then give
            // up after a few idle rounds instead of spinning forever (stuck
            // 'running' rows get reclaimed by claim_gen_jobs after 2 min).
            if (++stalls >= 6) break
            await new Promise((r) => setTimeout(r, 2000))
          } else {
            stalls = 0
          }
        } catch {
          // Network/parse failure mid-drain — surface it and stop, never let the
          // fire-and-forget pump() promise reject unhandled.
          setActionError('generation paused (network) — refresh the queue to resume')
          break
        }
      }
    } finally {
      pumpingRef.current = false
      if (!pumpCancelRef.current) {
        // Final sync so the banner reflects reality instead of a stuck "generating…".
        try {
          const st = await fetch(`/api/scriptwriter/batches/${batchId}/gen-status`).then((r) => r.json())
          if (st?.ok) setGenStatus({ active: st.active, done: st.done, failed: st.failed, total: st.total })
        } catch { /* ignore */ }
        fetchQueue()
      }
    }
  }, [batchId, fetchQueue])

  // Stop any in-flight pump when this component unmounts (batch change forces a
  // remount via key=, so this also fires when navigating between batches).
  useEffect(() => () => { pumpCancelRef.current = true }, [])

  // On load, resume pumping if this batch still has unfinished jobs (e.g. after
  // a reload mid-run, or arriving here straight from Import & Generate).
  useEffect(() => {
    let cancelled = false
    fetch(`/api/scriptwriter/batches/${batchId}/gen-status`).then((r) => r.json()).then((st) => {
      if (cancelled || !st?.ok) return
      if (st.total > 0) setGenStatus({ active: st.active, done: st.done, failed: st.failed, total: st.total })
      if (st.active > 0) pump()
    }).catch(() => {})
    return () => { cancelled = true }
  }, [batchId, pump])

  // Monotonic request id so a slow in-flight detail fetch can't overwrite a
  // newer one (fast j/k navigation would otherwise let an older response land
  // last and show a naskah that doesn't match the highlighted selection).
  const detailReqId = useRef(0)

  const fetchDetail = useCallback(async (naskahId: string) => {
    const reqId = ++detailReqId.current
    try {
      const res = await fetch(`/api/scriptwriter/naskah/${naskahId}`)
      const data = await res.json()
      if (reqId !== detailReqId.current) return // a newer fetch superseded this one
      if (data.ok) {
        // API returns { naskah: {..., current_version}, flags }. Normalize the
        // current_version shape the queue detail pane expects.
        setDetail({
          naskah: {
            id: data.naskah.id,
            title: data.naskah.title,
            status: data.naskah.status,
            current_version: {
              body: (data.naskah.current_version?.body || []) as Block[],
              hook_justification: data.naskah.current_version?.hook_justification ?? null,
            },
          },
          flags: data.flags || [],
        })
      }
    } catch {
      if (reqId === detailReqId.current) setActionError('network error loading naskah detail')
    }
  }, [])

  // Reset editing + (re)load detail ONLY when the selected naskah id actually
  // changes — keying this on the whole `items` array reference (which is a new
  // array on every fetchQueue) would silently wipe an in-progress edit whenever
  // any unrelated action refetched the queue.
  const currentId = items[selected]?.naskah_id
  useEffect(() => {
    setEditing(false)
    setEditedBlocks(null)
    if (currentId) fetchDetail(currentId)
    else setDetail(null)
  }, [currentId, fetchDetail])

  const approveOne = useCallback(async (naskahId: string) => {
    try {
      await fetch(`/api/scriptwriter/naskah/${naskahId}/approve`, { method: 'POST' })
    } finally {
      fetchQueue()
    }
  }, [fetchQueue])

  const rejectOne = useCallback(async (naskahId: string) => {
    try {
      await fetch(`/api/scriptwriter/naskah/${naskahId}/reject`, { method: 'POST' })
    } finally {
      fetchQueue()
    }
  }, [fetchQueue])

  // Keyboard triage: j/k move selection, a/r approve/reject the selected item.
  // Disabled entirely while editing so keystrokes can't move off a mid-edit
  // naskah or fire approve/reject from the editor.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return
      if (editing) return
      if (e.key === 'j') setSelected((s) => Math.min(s + 1, items.length - 1))
      else if (e.key === 'k') setSelected((s) => Math.max(s - 1, 0))
      else if (e.key === 'a' && items[selected]) approveOne(items[selected].naskah_id)
      else if (e.key === 'r' && items[selected]) rejectOne(items[selected].naskah_id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [items, selected, approveOne, rejectOne, editing])

  async function bulkApprove() {
    try {
      await fetch('/api/scriptwriter/triage/bulk-approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batchId, severity_threshold: threshold }),
      })
    } finally {
      fetchQueue()
    }
  }

  // Fan-out (decision #2): generate the cartesian product of selected briefs ×
  // selected personas. No persona selected → one item per brief using the
  // brief's own default persona (persona_id omitted).
  async function generateBatch() {
    if (selectedBriefIds.length === 0) return
    const personaIds = selectedPersonaIds.length > 0 ? selectedPersonaIds : [null]
    const genItems = selectedBriefIds.flatMap((briefId) =>
      personaIds.map((personaId) => ({ brief_id: briefId, persona_id: personaId })),
    )
    setGenerating(true)
    setGenProgress(`Queueing ${genItems.length} naskah…`)
    try {
      const res = await fetch(`/api/scriptwriter/batches/${batchId}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: genItems }),
      })
      const data = await res.json()
      if (!data.ok) { setGenProgress(data.error || 'failed to queue generation'); return }
      setSelectedBriefIds([]); setSelectedPersonaIds([])
      setGenProgress(`Queued ${data.enqueued} naskah — generating in the background…`)
      pump() // drain the queue; naskah stream into the list as they finish
    } catch {
      setGenProgress('network error during generation')
    } finally {
      setGenerating(false)
    }
  }

  // ── Editor actions (decision #3) ──────────────────────────────────────────
  function startEditing() {
    if (!detail) return
    // Deep-copy so edits don't mutate the fetched detail before save.
    setEditedBlocks(detail.naskah.current_version.body.map((b) => ({ ...b })))
    setEditing(true)
  }

  function updateBlock(blockId: string, patch: Partial<Pick<Block, 'text' | 'visual_note'>>) {
    setEditedBlocks((prev) => prev && prev.map((b) => (b.block_id === blockId ? { ...b, ...patch } : b)))
  }

  async function saveEdits() {
    if (!detail || !editedBlocks) return
    setSaving(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/scriptwriter/naskah/${detail.naskah.id}/versions`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editedBlocks, change_summary: 'writer edit' }),
      })
      const data = await res.json()
      if (!data.ok) { setActionError(data.error || 'failed to save edit'); return }
      // Refetch the saved version BEFORE dropping the working copy so the pane
      // never flashes the pre-edit body in between.
      await fetchDetail(detail.naskah.id)
      setEditing(false)
      setEditedBlocks(null)
      fetchQueue()
    } catch {
      setActionError('network error saving edit')
    } finally {
      setSaving(false)
    }
  }

  function cancelEdits() {
    setEditing(false)
    setEditedBlocks(null)
  }

  // Switching naskah while editing would discard the working copy (the reset
  // effect fires on id change) — confirm first so it's never a silent loss.
  function selectItem(i: number) {
    if (editing && editedBlocks && !window.confirm('Discard unsaved edits to this naskah?')) return
    setSelected(i)
  }

  // Force the full (rule + LLM critic) QC pass on the current version — the
  // manual-edit save only runs the cheap rule-based pass.
  async function rerunQc() {
    if (!detail) return
    setRerunning(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/scriptwriter/naskah/${detail.naskah.id}/qc/rerun`, { method: 'POST' })
      const data = await res.json()
      if (!data.ok) { setActionError(data.error || 'QC re-run failed'); return }
      await fetchDetail(detail.naskah.id)
      fetchQueue()
    } catch {
      setActionError('network error re-running QC')
    } finally {
      setRerunning(false)
    }
  }

  async function linkDoc() {
    if (!linkInput.trim()) return
    // The linked doc becomes a Push target, and Push is a full-rewrite — make the
    // overwrite conscious so a writer never loses an existing doc's content by surprise.
    if (!window.confirm('Linking means the "Push" button will OVERWRITE this doc\'s current content with this batch\'s naskah. Continue?')) return
    setLinking(true)
    setDocStatus(null)
    try {
      const res = await fetch(`/api/scriptwriter/batches/${batchId}/google-doc/link`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ google_doc: linkInput }),
      })
      const data = await res.json()
      if (!data.ok) {
        if (res.status === 428) { setDocStatus('Google not connected.'); window.open('/api/scriptwriter/google/oauth/start', '_blank', 'noopener,noreferrer') }
        else setDocStatus(data.error || 'link failed')
        return
      }
      setDocRef({ doc_id: data.doc_id, doc_url: data.doc_url })
      setDocStatus('Linked. Push now writes into this doc (it overwrites the doc’s current content).')
      setLinkOpen(false); setLinkInput('')
    } catch {
      setDocStatus('network error linking doc')
    } finally {
      setLinking(false)
    }
  }

  async function pushToDoc() {
    setDocSyncing('push')
    setDocStatus(null)
    try {
      const res = await fetch(`/api/scriptwriter/batches/${batchId}/google-doc/push`, { method: 'POST' })
      const data = await res.json()
      if (!data.ok) {
        if (res.status === 428) { setDocStatus('Google not connected.'); window.open('/api/scriptwriter/google/oauth/start', '_blank') }
        else setDocStatus(data.error || 'push failed')
        return
      }
      setDocRef({ doc_id: data.doc_id, doc_url: data.doc_url, last_pushed_at: new Date().toISOString() })
      setDocStatus(`Pushed ${data.naskah_count} naskah to Doc.`)
    } catch {
      setDocStatus('network error pushing to Doc')
    } finally {
      setDocSyncing(null)
    }
  }

  async function pullFromDoc() {
    setDocSyncing('pull')
    setDocStatus(null)
    try {
      const res = await fetch(`/api/scriptwriter/batches/${batchId}/google-doc/pull`, { method: 'POST' })
      const data = await res.json()
      if (!data.ok) {
        if (res.status === 428) { setDocStatus('Google not connected.'); window.open('/api/scriptwriter/google/oauth/start', '_blank') }
        else setDocStatus(data.error || 'pull failed')
        return
      }
      setDocStatus(`Synced ${data.synced} changed, ${data.unchanged} unchanged${data.errors?.length ? `, ${data.errors.length} errors` : ''}.`)
      fetchQueue()
    } catch {
      setDocStatus('network error pulling from Doc')
    } finally {
      setDocSyncing(null)
    }
  }

  async function flagAction(flagId: string, status: 'resolved' | 'dismissed') {
    try {
      await fetch(`/api/scriptwriter/qc/flags/${flagId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
    } finally {
      const current = items[selected]
      if (current) fetchDetail(current.naskah_id)
      fetchQueue()
    }
  }

  const flagsByBlock = new Map<string, Flag[]>()
  for (const f of detail?.flags || []) {
    if (f.status !== 'open') continue
    const list = flagsByBlock.get(f.target_ref.block_id) || []
    list.push(f)
    flagsByBlock.set(f.target_ref.block_id, list)
  }

  const fanoutCount = selectedBriefIds.length * (selectedPersonaIds.length || 1)
  const displayBlocks = editing ? (editedBlocks || []) : (detail?.naskah.current_version?.body || [])

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold text-text">{batchName}</h1>
          <p className="font-data text-xs text-mutedText">{items.length} in queue · j/k navigate · a approve · r reject</p>
          {actionError && <p role="alert" className="mt-0.5 text-xs text-destructive">{actionError}</p>}
        </div>
        <div className="flex items-center gap-2">
          <select value={threshold} onChange={(e) => setThreshold(e.target.value as 'none' | 'blocker_only')}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="none">Strict: zero flags</option>
            <option value="blocker_only">Loose: no blockers</option>
          </select>
          <button onClick={bulkApprove}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-onPrimary hover:opacity-90 cursor-pointer">
            <Check size={14} aria-hidden /> Bulk approve
          </button>
          <div className="mx-1 h-5 w-px bg-border" />
          {docRef && (
            <a href={docRef.doc_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <ExternalLink size={13} aria-hidden /> Open Doc
            </a>
          )}
          <button onClick={() => setLinkOpen((o) => !o)}
            title="Point this batch at an existing Google Doc you already made"
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text hover:bg-muted cursor-pointer">
            <Link2 size={14} aria-hidden /> Link
          </button>
          <button onClick={pushToDoc} disabled={docSyncing !== null}
            title="Rewrite the Google Doc from current naskah"
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text hover:bg-muted disabled:opacity-50 cursor-pointer">
            <FileUp size={14} aria-hidden /> {docSyncing === 'push' ? 'Pushing…' : docRef ? 'Push' : 'Push to Doc'}
          </button>
          {docRef && (
            <button onClick={pullFromDoc} disabled={docSyncing !== null}
              title="Pull writer edits back from the Doc"
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text hover:bg-muted disabled:opacity-50 cursor-pointer">
              <FileDown size={14} aria-hidden /> {docSyncing === 'pull' ? 'Pulling…' : 'Pull'}
            </button>
          )}
          <button onClick={fetchQueue} aria-label="Refresh queue"
            className="rounded-md p-1.5 text-mutedText hover:bg-muted hover:text-text cursor-pointer">
            <RefreshCw size={16} aria-hidden />
          </button>
        </div>
      </div>
      {linkOpen && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-6 py-2">
          <input value={linkInput} onChange={(e) => setLinkInput(e.target.value)} placeholder="Paste an existing Google Doc URL to link this batch to it"
            aria-label="Existing Google Doc URL"
            className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring" />
          <button onClick={linkDoc} disabled={linking || !linkInput.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-onPrimary hover:opacity-90 disabled:opacity-50 cursor-pointer">{linking ? 'Linking…' : 'Link'}</button>
          <button onClick={() => { setLinkOpen(false); setLinkInput('') }} className="text-xs text-mutedText hover:text-text cursor-pointer">Cancel</button>
        </div>
      )}
      {docStatus && <p className="border-b border-border bg-muted/40 px-6 py-1.5 text-xs text-mutedText">{docStatus}</p>}
      {genStatus && genStatus.total > 0 && (genStatus.active > 0 || genStatus.failed > 0) && (
        <div className="flex items-center gap-2 border-b border-border bg-accent/5 px-6 py-1.5 text-xs text-mutedText">
          {genStatus.active > 0 && <RefreshCw size={12} className="animate-spin text-accent" aria-hidden />}
          <span>
            Generating {genStatus.done}/{genStatus.total} done
            {genStatus.failed > 0 ? ` · ${genStatus.failed} failed` : ''}
            {genStatus.active > 0 ? ` · ${genStatus.active} left` : ' · finished'}
          </span>
        </div>
      )}

      {visibleBriefs.length > 0 && (
        <div className="border-b border-border bg-muted/30 px-6 py-2">
          <button onClick={() => setFanoutOpen((o) => !o)}
            aria-expanded={fanoutOpen} aria-controls="fanout-panel"
            className="flex w-full items-center gap-1.5 text-xs font-semibold text-text cursor-pointer">
            <Sparkles size={14} className="text-accent" aria-hidden />
            Generate naskah
            <span className="font-normal text-mutedText">· {visibleBriefs.length} briefs · {personas.length} personas</span>
            {(genStatus?.active ?? 0) > 0 && <span className="font-normal text-accent">· generating…</span>}
            <ChevronDown size={14} className={`ml-auto text-mutedText transition-transform ${fanoutOpen ? 'rotate-180' : ''}`} aria-hidden />
          </button>

          {fanoutOpen && (
            <div id="fanout-panel" className="mt-2 space-y-2">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-mutedText">Briefs</span>
                  <button onClick={() => setSelectedBriefIds(visibleBriefs.map((b) => b.id))} className="text-[11px] text-primary hover:underline cursor-pointer">all</button>
                  <button onClick={() => setSelectedBriefIds([])} className="text-[11px] text-mutedText hover:underline cursor-pointer">clear</button>
                  {selectedBriefIds.length > 0 && <span className="text-[11px] text-mutedText">{selectedBriefIds.length} selected</span>}
                </div>
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-surface p-1.5">
                  {visibleBriefs.map((b) => {
                    const on = selectedBriefIds.includes(b.id)
                    return (
                      <label key={b.id} className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs cursor-pointer ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-mutedText hover:text-text'}`}>
                        <input type="checkbox" className="sr-only" checked={on}
                          onChange={(e) => setSelectedBriefIds(e.target.checked ? [...selectedBriefIds, b.id] : selectedBriefIds.filter((id) => id !== b.id))} />
                        {b.title}
                      </label>
                    )
                  })}
                </div>
              </div>

              {personas.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-mutedText">Personas</span>
                    <button onClick={() => setSelectedPersonaIds(personas.map((p) => p.id))} className="text-[11px] text-primary hover:underline cursor-pointer">all</button>
                    <button onClick={() => setSelectedPersonaIds([])} className="text-[11px] text-mutedText hover:underline cursor-pointer">clear</button>
                    {selectedPersonaIds.length === 0 && <span className="text-[11px] text-mutedText">(none → brief default)</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {personas.map((p) => {
                      const on = selectedPersonaIds.includes(p.id)
                      return (
                        <label key={p.id} className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs cursor-pointer ${on ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-background text-mutedText hover:text-text'}`}>
                          <input type="checkbox" className="sr-only" checked={on}
                            onChange={(e) => setSelectedPersonaIds(e.target.checked ? [...selectedPersonaIds, p.id] : selectedPersonaIds.filter((id) => id !== p.id))} />
                          {p.name}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-0.5">
                <button onClick={generateBatch} disabled={generating || selectedBriefIds.length === 0 || (genStatus?.active ?? 0) > 0}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-onPrimary hover:opacity-90 disabled:opacity-50 cursor-pointer">
                  {(genStatus?.active ?? 0) > 0 ? 'Generating…' : generating ? 'Queueing…' : `Generate ${fanoutCount} naskah`}
                </button>
                {selectedBriefIds.length > 0 && (
                  <span className="text-[11px] text-mutedText">{selectedBriefIds.length} briefs × {selectedPersonaIds.length || 1} personas</span>
                )}
                {genProgress && <span className="text-xs text-mutedText">{genProgress}</span>}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-96 shrink-0 overflow-y-auto border-r border-border">
          {loading && items.length === 0 && <p className="p-4 text-sm text-mutedText">Loading…</p>}
          {!loading && items.length === 0 && <p className="p-4 text-sm text-mutedText">Nothing in the queue. Generate some naskah above.</p>}
          {items.map((item, i) => (
            <button key={item.naskah_id} onClick={() => selectItem(i)}
              aria-current={i === selected ? 'true' : undefined}
              className={`relative block w-full border-b border-border px-4 py-3 text-left transition-colors duration-150 cursor-pointer ${
                i === selected ? 'bg-primary/5' : 'hover:bg-muted/40'
              }`}>
              {i === selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
              <div className="flex items-center justify-between gap-2">
                <span className={`truncate text-sm text-text ${i === selected ? 'font-semibold' : 'font-medium'}`}>{item.title || 'Untitled naskah'}</span>
                {item.flag_counts.blocker + item.flag_counts.warning + item.flag_counts.nit === 0 && (
                  <Check size={14} className="shrink-0 text-primary" aria-hidden />
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {item.persona_name && <span className="rounded bg-accent/10 px-1.5 py-0.5 font-data text-[11px] font-medium text-accent">{item.persona_name}</span>}
                {item.hook_name && <span className="font-data text-[11px] text-mutedText">{item.hook_name}</span>}
                {item.flag_counts.blocker > 0 && (
                  <span className={`rounded border px-1.5 py-0.5 font-data text-[11px] ${SEVERITY_STYLES.blocker}`}>{item.flag_counts.blocker} blocker</span>
                )}
                {item.flag_counts.warning > 0 && (
                  <span className={`rounded border px-1.5 py-0.5 font-data text-[11px] ${SEVERITY_STYLES.warning}`}>{item.flag_counts.warning} warning</span>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!detail && <p className="text-sm text-mutedText">Select a naskah from the queue.</p>}
          {detail && (
            <div className="mx-auto max-w-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text">{detail.naskah.title || 'Untitled naskah'}</h2>
                <div className="flex gap-2">
                  {!editing ? (
                    <>
                      <button onClick={startEditing}
                        className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-muted cursor-pointer">
                        <Pencil size={14} aria-hidden /> Edit
                      </button>
                      <button onClick={rerunQc} disabled={rerunning}
                        title="Force the full rule + LLM critic QC pass on this version"
                        className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-muted disabled:opacity-50 cursor-pointer">
                        <ShieldCheck size={14} aria-hidden /> {rerunning ? 'Checking…' : 'Re-run QC'}
                      </button>
                      <button onClick={() => rejectOne(detail.naskah.id)}
                        className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 cursor-pointer">
                        <X size={14} aria-hidden /> Reject
                      </button>
                      <button onClick={() => approveOne(detail.naskah.id)}
                        className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-onPrimary hover:opacity-90 cursor-pointer">
                        <Check size={14} aria-hidden /> Approve
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={cancelEdits} disabled={saving}
                        className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-muted disabled:opacity-50 cursor-pointer">
                        <RotateCcw size={14} aria-hidden /> Cancel
                      </button>
                      <button onClick={saveEdits} disabled={saving}
                        className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-onPrimary hover:opacity-90 disabled:opacity-50 cursor-pointer">
                        <Save size={14} aria-hidden /> {saving ? 'Saving…' : 'Save as new version'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {editing && (
                <p className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
                  Editing creates a new version (nothing is overwritten). Saving re-runs the rule-based QC; use Re-run QC for the full critic pass.
                </p>
              )}

              {!editing && detail.naskah.current_version?.hook_justification && (
                <p className="rounded-md bg-muted/60 px-3 py-2 text-xs italic text-mutedText">{detail.naskah.current_version.hook_justification}</p>
              )}

              <div className="space-y-3">
                {displayBlocks.map((block) => {
                  const blockFlags = flagsByBlock.get(block.block_id) || []
                  return (
                    <div key={block.block_id} className="rounded-lg border border-border bg-surface p-3.5">
                      <div className="flex items-center gap-1.5 font-data text-[10px] uppercase tracking-wider text-mutedText">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-semibold text-text">{block.section_key}</span>
                        <span>shot {block.shot_no} · line {block.line_no}{block.timestamp_range ? ` · ${block.timestamp_range}` : ''}</span>
                      </div>
                      {!editing ? (
                        <>
                          <p className="mt-2 text-[15px] leading-relaxed text-text">{block.speaker ? <span className="font-semibold text-primary">{block.speaker}: </span> : null}{block.text}</p>
                          {block.visual_note && <p className="mt-1.5 text-xs italic text-mutedText">▸ {block.visual_note}</p>}
                        </>
                      ) : (
                        <div className="mt-1.5 space-y-1.5">
                          {block.speaker && <span className="text-xs font-medium text-text">{block.speaker}:</span>}
                          <textarea
                            value={block.text}
                            onChange={(e) => updateBlock(block.block_id, { text: e.target.value })}
                            rows={2}
                            aria-label={`Line text for shot ${block.shot_no} line ${block.line_no}`}
                            className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <input
                            value={block.visual_note || ''}
                            onChange={(e) => updateBlock(block.block_id, { visual_note: e.target.value || null })}
                            placeholder="visual note (optional)"
                            aria-label={`Visual note for shot ${block.shot_no} line ${block.line_no}`}
                            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs italic text-mutedText focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                      )}
                      {!editing && blockFlags.map((f) => (
                        <div key={f.id} className={`mt-2 flex items-start justify-between gap-2 rounded border px-2 py-1.5 text-xs ${SEVERITY_STYLES[f.severity]}`}>
                          <span><span className="font-medium uppercase">{f.severity}</span> · {f.category.replace(/_/g, ' ')} — {f.message}</span>
                          <div className="flex shrink-0 gap-1">
                            <button onClick={() => flagAction(f.id, 'resolved')} className="hover:underline cursor-pointer">Resolve</button>
                            <button onClick={() => flagAction(f.id, 'dismissed')} className="hover:underline cursor-pointer">Dismiss</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
