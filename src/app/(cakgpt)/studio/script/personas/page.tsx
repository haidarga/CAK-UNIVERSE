import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requirePageUser } from '@/lib/cakgpt/auth'
import { getActiveClientId } from '@/lib/cakgpt/active-client'
import { PersonaForm } from '@/components/cakgpt/PersonaForm'
import { PersonasManager } from '@/components/cakgpt/PersonasManager'
import { UserRound } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PersonasPage() {
  const supabase = await createServerClient()
  const user = await requirePageUser(supabase)
  const activeClient = await getActiveClientId()

  // Shared-or-scoped: in a workspace show that client's personas + shared (null).
  let personaQuery = supabase.from('personas').select('*').eq('created_by', user.id).eq('is_active', true).order('created_at', { ascending: false })
  if (activeClient) personaQuery = personaQuery.or(`client_id.eq.${activeClient},client_id.is.null`)
  const { data: personas } = await personaQuery

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text">Persona Voice Profiles</h1>
        <p className="mt-0.5 text-sm text-mutedText">Constrains generation so drafts already sound like the persona before QC even runs.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {(!personas || personas.length === 0) ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
              <UserRound size={28} strokeWidth={1.5} className="text-mutedText" aria-hidden />
              <p className="text-sm text-mutedText">No personas yet. Create the first one on the right.</p>
            </div>
          ) : (
            <PersonasManager personas={personas} />
          )}
        </div>

        <div>
          <PersonaForm />
        </div>
      </div>
    </div>
  )
}
