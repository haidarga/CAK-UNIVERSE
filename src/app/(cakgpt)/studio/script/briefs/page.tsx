import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requirePageUser } from '@/lib/cakgpt/auth'
import { getActiveClientId } from '@/lib/cakgpt/active-client'
import { BriefForm } from '@/components/cakgpt/BriefForm'
import { BriefImport } from '@/components/cakgpt/BriefImport'
import { BriefsManager } from '@/components/cakgpt/BriefsManager'
import { FileText } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function BriefsPage() {
  const supabase = await createServerClient()
  const user = await requirePageUser(supabase)
  const activeClient = await getActiveClientId()

  // Hide archived (soft-deleted) briefs.
  let briefQuery = supabase.from('sw_strategist_briefs').select('*').eq('created_by', user.id).neq('status', 'archived').order('created_at', { ascending: false })
  if (activeClient) briefQuery = briefQuery.eq('client_id', activeClient)

  const [{ data: briefs }, { data: personas }, { data: clients }] = await Promise.all([
    briefQuery,
    (activeClient
      ? supabase.from('sw_personas').select('id, name, cluster').eq('created_by', user.id).eq('is_active', true).or(`client_id.eq.${activeClient},client_id.is.null`)
      : supabase.from('sw_personas').select('id, name, cluster').eq('created_by', user.id).eq('is_active', true)),
    supabase.from('sw_clients').select('id, name').eq('created_by', user.id).eq('is_active', true),
  ])

  const personaNames = Object.fromEntries((personas || []).map((p) => [p.id, p.name]))
  const clientNames = Object.fromEntries((clients || []).map((c) => [c.id, c.name]))

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text">Strategist Briefs</h1>
        <p className="mt-0.5 text-sm text-mutedText">What the strategist team hands off — translated into naskah via generation.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {(!briefs || briefs.length === 0) ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
              <FileText size={28} strokeWidth={1.5} className="text-mutedText" aria-hidden />
              <p className="text-sm text-mutedText">No briefs yet. Add the first one on the right.</p>
            </div>
          ) : (
            <BriefsManager briefs={briefs} clientNames={clientNames} personaNames={personaNames} />
          )}
        </div>

        <div className="space-y-6">
          <BriefImport clients={clients || []} personas={personas || []} />
          <BriefForm personas={personas || []} clients={clients || []} />
        </div>
      </div>
    </div>
  )
}
