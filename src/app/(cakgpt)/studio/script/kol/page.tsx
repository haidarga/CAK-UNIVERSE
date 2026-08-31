import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requirePageUser } from '@/lib/cakgpt/auth'
import { KolFinder } from '@/components/kol/KolFinder'

export const dynamic = 'force-dynamic'

export default async function KolFinderPage() {
  const supabase = await createServerClient()
  await requirePageUser(supabase)

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <KolFinder />
    </div>
  )
}
