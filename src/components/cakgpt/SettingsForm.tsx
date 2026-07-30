'use client'

import { useState } from 'react'
import { KeyRound, CheckCircle2, Video, Zap } from 'lucide-react'

export function SettingsForm({
  initialGeminiConfigured,
  initialStudioConfigured,
  initialStudioUrl,
}: {
  initialGeminiConfigured: boolean
  initialStudioConfigured: boolean
  initialStudioUrl: string
}) {
  const [geminiKey, setGeminiKey] = useState('')
  const [geminiConfigured, setGeminiConfigured] = useState(initialGeminiConfigured)
  const [geminiSaving, setGeminiSaving] = useState(false)
  const [geminiError, setGeminiError] = useState<string | null>(null)
  const [geminiSaved, setGeminiSaved] = useState(false)

  // Video Studio integration state
  const [studioUrl, setStudioUrl] = useState(initialStudioUrl || 'http://localhost:3000')
  const [studioKey, setStudioKey] = useState('')
  const [studioConfigured, setStudioConfigured] = useState(initialStudioConfigured)
  const [studioSaving, setStudioSaving] = useState(false)
  const [studioError, setStudioError] = useState<string | null>(null)
  const [studioSaved, setStudioSaved] = useState(false)

  async function onSaveGemini(e: React.FormEvent) {
    e.preventDefault()
    if (!geminiKey.trim()) return setGeminiError('Paste your Gemini API key first')
    setGeminiSaving(true)
    setGeminiError(null)
    setGeminiSaved(false)
    try {
      const res = await fetch('/api/scriptwriter/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini_api_key: geminiKey.trim() }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'failed to save')
      setGeminiConfigured(true)
      setGeminiSaved(true)
      setGeminiKey('')
    } catch (e) {
      setGeminiError(e instanceof Error ? e.message : 'network error')
    } finally {
      setGeminiSaving(false)
    }
  }

  async function onSaveStudio(e: React.FormEvent) {
    e.preventDefault()
    if (!studioUrl.trim()) return setStudioError('Studio URL is required')

    let formattedUrl = studioUrl.trim()
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`
    }

    setStudioSaving(true)
    setStudioError(null)
    setStudioSaved(false)
    try {
      const res = await fetch('/api/scriptwriter/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studio_api_url: formattedUrl,
          ...(studioKey.trim() ? { studio_api_key: studioKey.trim() } : {}),
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'failed to save studio settings')
      setStudioUrl(formattedUrl)
      setStudioConfigured(true)
      setStudioSaved(true)
      setStudioKey('')
    } catch (e) {
      setStudioError(e instanceof Error ? e.message : 'network error')
    } finally {
      setStudioSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Gemini Section */}
      <form onSubmit={onSaveGemini} className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-primary" aria-hidden />
          <h2 className="text-sm font-semibold text-text">Gemini API key</h2>
          {geminiConfigured && (
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <CheckCircle2 size={12} aria-hidden /> configured
            </span>
          )}
        </div>
        <p className="text-xs text-mutedText">
          Used for naskah generation, auto-QC, and idea mode. Get one at{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-primary hover:underline">aistudio.google.com/apikey</a>.
        </p>

        <div>
          <label htmlFor="gemini_key" className="mb-1 block text-xs font-medium text-text">
            {geminiConfigured ? 'Replace key' : 'API key'}
          </label>
          <input
            id="gemini_key"
            type="password"
            autoComplete="off"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder={geminiConfigured ? '••••••••••••••••' : 'AIza…'}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {geminiError && <p role="alert" className="text-xs text-destructive">{geminiError}</p>}
        {geminiSaved && <p className="text-xs text-primary">Saved ✓</p>}

        <button type="submit" disabled={geminiSaving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-onPrimary transition-opacity duration-150 hover:opacity-90 disabled:opacity-50 cursor-pointer">
          {geminiSaving ? 'Saving…' : 'Save Gemini Key'}
        </button>
      </form>

      {/* CAK Video Studio Integration Section */}
      <form onSubmit={onSaveStudio} className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <Video size={18} className="text-purple-400" aria-hidden />
          <h2 className="text-sm font-semibold text-text">CAK Video Studio Integration</h2>
          {studioConfigured ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-xs font-medium text-emerald-400">
              <CheckCircle2 size={12} aria-hidden /> connected
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-xs font-medium text-amber-400">
              not connected
            </span>
          )}
        </div>
        <p className="text-xs text-mutedText">
          Connect Caketing to your CAK Video Studio instance. Generate an API Key in Video Studio Settings → External API Keys and paste it here.
        </p>

        <div className="space-y-3">
          <div>
            <label htmlFor="studio_url" className="mb-1 block text-xs font-medium text-text">
              Studio Base URL
            </label>
            <input
              id="studio_url"
              type="text"
              value={studioUrl}
              onChange={(e) => setStudioUrl(e.target.value)}
              placeholder="http://localhost:3000 or https://studio.yourdomain.com"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text font-mono focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label htmlFor="studio_key" className="mb-1 block text-xs font-medium text-text">
              {studioConfigured ? 'Replace Studio API Key' : 'Studio API Key'}
            </label>
            <input
              id="studio_key"
              type="password"
              autoComplete="off"
              value={studioKey}
              onChange={(e) => setStudioKey(e.target.value)}
              placeholder={studioConfigured ? '••••••••••••••••' : 'cak_...'}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text font-mono focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {studioError && <p role="alert" className="text-xs text-destructive">{studioError}</p>}
        {studioSaved && <p className="text-xs text-primary">Video Studio integration saved ✓</p>}

        <button type="submit" disabled={studioSaving}
          className="rounded-md bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer flex items-center gap-1.5">
          <Zap size={14} /> {studioSaving ? 'Saving…' : 'Save Studio Integration'}
        </button>
      </form>
    </div>
  )
}
