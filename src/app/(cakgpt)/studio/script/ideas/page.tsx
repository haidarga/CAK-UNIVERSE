import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requirePageUser } from '@/lib/cakgpt/auth'
import { getActiveClientId } from '@/lib/cakgpt/active-client'
import { IdeaGenerator } from '@/components/cakgpt/IdeaGenerator'

export const dynamic = 'force-dynamic'

export default async function IdeasPage() {
  const supabase = await createServerClient()
  const user = await requirePageUser(supabase)
  const activeClient = await getActiveClientId()

  let briefQuery = supabase.from('sw_strategist_briefs').select('id, title').eq('created_by', user.id)
  let batchQuery = supabase.from('sw_batches').select('id, name').eq('created_by', user.id).eq('status', 'open')
  if (activeClient) { briefQuery = briefQuery.eq('client_id', activeClient); batchQuery = batchQuery.eq('client_id', activeClient) }

  const [{ data: personas }, { data: briefs }, { data: batches }] = await Promise.all([
    (activeClient
      ? supabase.from('sw_personas').select('id, name').eq('created_by', user.id).eq('is_active', true).or(`client_id.eq.${activeClient},client_id.is.null`)
      : supabase.from('sw_personas').select('id, name').eq('created_by', user.id).eq('is_active', true)),
    briefQuery,
    batchQuery,
  ])

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text">Idea / Brainstorm Mode</h1>
        <p className="mt-0.5 text-sm text-mutedText">Stuck for an angle? Get short hooks to react to — no commitment, no QC, no pressure.</p>
      </div>
      <IdeaGenerator personas={personas || []} briefs={briefs || []} batches={batches || []} />
    </div>
  )
}
