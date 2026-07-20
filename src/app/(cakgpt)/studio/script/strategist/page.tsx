import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requirePageUser } from '@/lib/cakgpt/auth'
import { StrategistMode } from '@/components/cakgpt/StrategistMode'

export const dynamic = 'force-dynamic'

export default async function StrategistPage() {
  const supabase = await createServerClient()
  await requirePageUser(supabase)

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text">Strategist Mode</h1>
        <p className="mt-0.5 text-sm text-mutedText">
          Paste link akun TikTok/IG → dapetin metrik real + taksiran rate, CPM/CPC/CTR, dan insight buat brief. Data terukur ditandai hijau, taksiran AI ditandai kuning.
        </p>
      </div>
      <StrategistMode />
    </div>
  )
}
