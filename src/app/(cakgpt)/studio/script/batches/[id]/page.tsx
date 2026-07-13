import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requirePageUser } from '@/lib/cakgpt/auth'
import { notFound } from 'next/navigation'
import { TriageQueue } from '@/components/cakgpt/TriageQueue'

export const dynamic = 'force-dynamic'

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const user = await requirePageUser(supabase)

  const { data: batch } = await supabase.from('batches').select('*').eq('id', id).eq('created_by', user.id).maybeSingle()
  if (!batch) notFound()

  const [{ data: briefs }, { data: personas }] = await Promise.all([
    supabase.from('strategist_briefs').select('id, title, status, client_id').eq('created_by', user.id).eq('status', 'ready').order('created_at', { ascending: false }),
    supabase.from('personas').select('id, name').eq('created_by', user.id).eq('is_active', true).order('created_at', { ascending: false }),
  ])

  return (
    <TriageQueue
      key={id}
      batchId={id}
      batchName={batch.name}
      readyBriefs={briefs || []}
      personas={personas || []}
      batchClientId={batch.client_id}
      initialDocRef={batch.external_doc_ref}
    />
  )
}
