import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requirePageUser } from '@/lib/cakgpt/auth'
import { getActiveClientId } from '@/lib/cakgpt/active-client'
import { CreateBatchButton } from '@/components/cakgpt/CreateBatchButton'
import { NaskahImport } from '@/components/cakgpt/NaskahImport'
import { DeleteBatchButton } from '@/components/cakgpt/DeleteBatchButton'
import Link from 'next/link'
import { Inbox } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createServerClient()
  const user = await requirePageUser(supabase)
  const activeClient = await getActiveClientId()

  let batchQuery = supabase.from('sw_batches').select('*').eq('created_by', user.id).order('created_at', { ascending: false })
  if (activeClient) batchQuery = batchQuery.eq('client_id', activeClient)

  const [{ data: batches }, { data: clients }, { data: personas }] = await Promise.all([
    batchQuery,
    supabase.from('sw_clients').select('id, name').eq('created_by', user.id).eq('is_active', true),
    // Personas are shared-or-scoped: in a workspace show that client's + shared (null).
    (activeClient
      ? supabase.from('sw_personas').select('id, name').eq('created_by', user.id).eq('is_active', true).or(`client_id.eq.${activeClient},client_id.is.null`)
      : supabase.from('sw_personas').select('id, name').eq('created_by', user.id).eq('is_active', true)),
  ])

  const batchIds = (batches || []).map((b) => b.id)
  const { data: naskahRows } = batchIds.length
    ? await supabase.from('sw_naskah').select('batch_id, status').in('batch_id', batchIds)
    : { data: [] as Array<{ batch_id: string; status: string }> }

  const clientNameById = new Map((clients || []).map((c) => [c.id, c.name]))
  const countsByBatch = new Map<string, { total: number; approved: number; draft: number }>()
  for (const n of naskahRows || []) {
    const c = countsByBatch.get(n.batch_id) || { total: 0, approved: 0, draft: 0 }
    c.total++
    if (n.status === 'approved') c.approved++
    if (n.status === 'draft') c.draft++
    countsByBatch.set(n.batch_id, c)
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Batches</h1>
          <p className="mt-0.5 text-sm text-mutedText">One batch = one generation session (maps to one Google Doc in Phase 2).</p>
        </div>
        <div className="flex items-center gap-2">
          <NaskahImport clients={clients || []} personas={personas || []} />
          <CreateBatchButton />
        </div>
      </div>

      {(!batches || batches.length === 0) ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <Inbox size={28} strokeWidth={1.5} className="text-mutedText" aria-hidden />
          <p className="text-sm text-mutedText">No batches yet. Create one to start generating naskah.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-mutedText">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 font-data">Naskah</th>
                <th className="px-4 py-2.5 font-data">Approved</th>
                <th className="px-4 py-2.5">Created</th>
                <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const c = countsByBatch.get(b.id) || { total: 0, approved: 0, draft: 0 }
                return (
                  <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/studio/script/batches/${b.id}`} className="font-medium text-primary hover:underline">
                          {b.name}
                        </Link>
                        {b.client_id && clientNameById.get(b.client_id) && (
                          <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">{clientNameById.get(b.client_id)}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
                        b.status === 'open' ? 'bg-primary/10 text-primary' : 'bg-muted text-mutedText'
                      }`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-data tabular-nums">{c.total}</td>
                    <td className="px-4 py-3 font-data tabular-nums">{c.approved}</td>
                    <td className="px-4 py-3 text-mutedText">{new Date(b.created_at).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 text-right">
                      <DeleteBatchButton batchId={b.id} batchName={b.name} naskahCount={c.total} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
