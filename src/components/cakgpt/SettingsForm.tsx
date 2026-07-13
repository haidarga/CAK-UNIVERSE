'use client'

import { useState } from 'react'
import { KeyRound, CheckCircle2 } from 'lucide-react'

export function SettingsForm({ initialGeminiConfigured }: { initialGeminiConfigured: boolean }) {
  const [geminiKey, setGeminiKey] = useState('')
  const [configured, setConfigured] = useState(initialGeminiConfigured)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!geminiKey.trim()) return setError('Paste your Gemini API key first')
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/scriptwriter/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini_api_key: geminiKey.trim() }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'failed to save')
      setConfigured(true)
      setSaved(true)
      setGeminiKey('') // never keep the raw value in state longer than needed
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <KeyRound size={18} className="text-primary" aria-hidden />
        <h2 className="text-sm font-semibold text-text">Gemini API key</h2>
        {configured && (
          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <CheckCircle2 size={12} aria-hidden /> configured
          </span>
        )}
      </div>
      <p className="text-xs text-mutedText">
        Used for naskah generation, auto-QC, and idea mode. Get one at{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-primary hover:underline">aistudio.google.com/apikey</a>.
        Once saved it's write-only here — the page never shows the stored value back.
      </p>

      <div>
        <label htmlFor="gemini_key" className="mb-1 block text-xs font-medium text-text">
          {configured ? 'Replace key' : 'API key'}
        </label>
        <input
          id="gemini_key"
          type="password"
          autoComplete="off"
          value={geminiKey}
          onChange={(e) => setGeminiKey(e.target.value)}
          placeholder={configured ? '••••••••••••••••' : 'AIza…'}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {saved && <p className="text-xs text-primary">Saved.</p>}

      <button type="submit" disabled={saving}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-onPrimary transition-opacity duration-150 hover:opacity-90 disabled:opacity-50 cursor-pointer">
        {saving ? 'Saving…' : 'Save key'}
      </button>
    </form>
  )
}
