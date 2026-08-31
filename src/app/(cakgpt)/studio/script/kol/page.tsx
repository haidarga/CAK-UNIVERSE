import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requirePageUser } from '@/lib/cakgpt/auth'
import { KolFinder } from '@/components/kol/KolFinder'

export const dynamic = 'force-dynamic'

export default async function KolFinderPage() {
  const supabase = await createServerClient()
  await requirePageUser(supabase)

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-7">
        <h1 className="text-xl font-semibold text-text">Mencari KOL yang Hilang</h1>
        <p className="mt-0.5 max-w-2xl text-sm leading-relaxed text-mutedText">
          Strategist Mode butuh handle yang udah kamu punya. Ini kebalikannya: kasih hashtag atau
          kata kunci, dapet daftar KOL yang udah kesaring tier, keaktifan, dan konsistensi niche —
          tanpa scroll hashtag dan buka akun satu per satu.
        </p>
      </div>
      <KolFinder />
    </div>
  )
}
