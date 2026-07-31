'use client'

import { useEffect, useState } from 'react'
import { Brain, Search, Plus, Trash2, ExternalLink, Sparkles, Tag, Clock } from 'lucide-react'

type KnowledgeItem = {
  id: string
  title: string
  content: string
  source_type: string
  source_url?: string | null
  tags: string[]
  created_at: string
}

export function KnowledgeManager() {
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterSource, setFilterSource] = useState('all')

  const [createModal, setCreateModal] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [saving, setSaving] = useState(false)

  const [activeItem, setActiveItem] = useState<KnowledgeItem | null>(null)

  useEffect(() => {
    loadKnowledge()
  }, [])

  async function loadKnowledge() {
    setLoading(true)
    try {
      const res = await fetch('/api/knowledge')
      const data = await res.json()
      if (data.ok) {
        setItems(data.items || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    try {
      const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          source_type: 'manual',
          tags,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setCreateModal(false)
        setTitle('')
        setContent('')
        setTagsInput('')
        loadKnowledge()
      } else {
        alert(data.error || 'Gagal menyimpan knowledge')
      }
    } catch {
      alert('Gagal menghubungi server')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus item knowledge ini?')) return
    try {
      const res = await fetch(`/api/knowledge/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id))
        if (activeItem?.id === id) setActiveItem(null)
      } else {
        alert(data.error || 'Gagal menghapus')
      }
    } catch {
      alert('Gagal menghapus')
    }
  }

  const filtered = items.filter((it) => {
    const matchSearch =
      it.title.toLowerCase().includes(search.toLowerCase()) ||
      it.content.toLowerCase().includes(search.toLowerCase()) ||
      it.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
    const matchSource = filterSource === 'all' || it.source_type === filterSource
    return matchSearch && matchSource
  })

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-extrabold text-text flex items-center gap-2">
            <Brain className="size-6 text-emerald-400" />
            Knowledge Base Hub
          </h1>
          <p className="text-xs text-mutedText mt-1">
            Simpan & kelola referensi hasil Content Translator, Trend Radar, dan riset manual lu untuk dipakai di Brief & Naskah.
          </p>
        </div>
        <button
          onClick={() => setCreateModal(true)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-black hover:bg-emerald-400 transition-colors shadow-md shadow-emerald-500/20"
        >
          <Plus size={16} /> Buat Knowledge Baru
        </button>
      </div>

      {/* Filter & Search Controls */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={14} className="absolute left-3 top-2.5 text-mutedText" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari berdasarkan judul, isi, atau tag (mis. referensi acekid)..."
            className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-xs text-text outline-none focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {['all', 'content_translator', 'trend_radar', 'manual'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterSource(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                filterSource === st
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 font-bold'
                  : 'border-border bg-surface text-mutedText hover:text-text'
              }`}
            >
              {st === 'all' ? 'Semua' : st === 'content_translator' ? 'Translator' : st === 'trend_radar' ? 'Trend Radar' : 'Manual'}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Left Column: List */}
        <div className="md:col-span-1 space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {loading ? (
            <div className="py-12 text-center text-xs text-mutedText">Memuat Knowledge Base...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-mutedText border border-dashed border-border rounded-xl p-4">
              Tidak ada knowledge item.
            </div>
          ) : (
            filtered.map((it) => (
              <div
                key={it.id}
                onClick={() => setActiveItem(it)}
                className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                  activeItem?.id === it.id
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-text ring-1 ring-emerald-500/50 shadow-md'
                    : 'border-border bg-surface hover:border-border/80 text-mutedText hover:text-text'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-xs text-text line-clamp-1">{it.title}</h3>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] font-mono text-mutedText uppercase">
                    {it.source_type}
                  </span>
                </div>
                <p className="text-[11px] text-mutedText line-clamp-2 mt-1">{it.content}</p>
                <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border/40 text-[10px] text-mutedText">
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> {new Date(it.created_at).toLocaleDateString('id-ID')}
                  </span>
                  {it.tags.length > 0 && (
                    <span className="flex items-center gap-1 font-mono text-emerald-400">
                      <Tag size={10} /> #{it.tags[0]}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Column: Detail Preview */}
        <div className="md:col-span-2 rounded-xl border border-border bg-surface p-5 min-h-[400px]">
          {activeItem ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
                <div>
                  <h2 className="text-base font-bold text-text">{activeItem.title}</h2>
                  <div className="flex items-center gap-2 mt-1 text-xs text-mutedText">
                    <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase">
                      {activeItem.source_type}
                    </span>
                    <span>Dibuat: {new Date(activeItem.created_at).toLocaleString('id-ID')}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(activeItem.id)}
                  className="p-1.5 text-mutedText hover:text-destructive transition-colors rounded-md hover:bg-muted"
                  title="Hapus Knowledge"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {activeItem.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {activeItem.tags.map((t, idx) => (
                    <span key={idx} className="rounded bg-muted border border-border px-2 py-0.5 text-xs text-mutedText">
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              {activeItem.source_url && (
                <div>
                  <a
                    href={activeItem.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <ExternalLink size={13} /> {activeItem.source_url}
                  </a>
                </div>
              )}

              <div className="rounded-lg border border-border bg-background p-4 text-xs leading-relaxed text-text whitespace-pre-wrap font-mono max-h-[420px] overflow-y-auto">
                {activeItem.content}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-20 text-center text-mutedText">
              <Brain size={40} className="text-mutedText/40 mb-3" />
              <p className="text-xs font-semibold">Pilih salah satu item knowledge di sebelah kiri untuk melihat detailnya.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-text flex items-center gap-2">
              <Brain size={18} className="text-emerald-400" />
              Tambah Knowledge Base Baru
            </h3>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Judul Knowledge / Referensi:</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="misal: Referensi AceKid 1 — Script Storybook"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-text outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Konten / Insight Referensi:</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                placeholder="Tuliskan arahan, hook, visual style, atau naskah referensi di sini..."
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-text outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Tags (pisahkan koma):</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="misal: acekid, ugc, 2d-animation"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-text outline-none focus:border-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => setCreateModal(false)}
                className="rounded-md border border-border px-4 py-2 text-xs font-semibold text-mutedText hover:bg-muted"
              >
                Batal
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !title.trim() || !content.trim()}
                className="rounded-md bg-emerald-500 px-4 py-2 text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan Knowledge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
