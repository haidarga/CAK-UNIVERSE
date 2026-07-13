import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requirePageUser } from '@/lib/cakgpt/auth'
import { ClientForm } from '@/components/cakgpt/ClientForm'
import { ClientsManager } from '@/components/cakgpt/ClientsManager'
import { Building2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  const supabase = await createServerClient()
  const user = await requirePageUser(supabase)

  const { data: clients } = await supabase
    .from('sw_clients').select('*').eq('created_by', user.id).eq('is_active', true).order('created_at', { ascending: false })

  const clientIds = (clients || []).map((c) => c.id)
  const { data: briefRows } = clientIds.length
    ? await supabase.from('sw_strategist_briefs').select('client_id').eq('created_by', user.id).in('client_id', clientIds)
    : { data: [] as Array<{ client_id: string | null }> }

  const briefCounts: Record<string, number> = {}
  for (const b of briefRows || []) {
    if (!b.client_id) continue
    briefCounts[b.client_id] = (briefCounts[b.client_id] || 0) + 1
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text">Clients / Brands</h1>
        <p className="mt-0.5 text-sm text-mutedText">Every brief and batch belongs to a client — this is what keeps docs separated per brand.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {(!clients || clients.length === 0) ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
              <Building2 size={28} strokeWidth={1.5} className="text-mutedText" aria-hidden />
              <p className="text-sm text-mutedText">No clients yet. Add the first one on the right.</p>
            </div>
          ) : (
            <ClientsManager clients={clients} briefCounts={briefCounts} />
          )}
        </div>

        <div>
          <ClientForm />
        </div>
      </div>
    </div>
  )
}
