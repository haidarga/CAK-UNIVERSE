import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { getActiveClientId } from '@/lib/cakgpt/active-client'

// Shortlists — the actual deliverable of a KOL search.
//
// Entries are stored as a SNAPSHOT, not as references. Follower counts move
// daily and a creator can go dormant next week; a shortlist has to remain an
// accurate record of what was true when the decision was made, otherwise a
// campaign post-mortem cannot tell a bad pick from a creator who changed.

export const runtime = 'nodejs'

const EntrySchema = z.object({
  handle: z.string().min(1).max(120),
  platform: z.enum(['tiktok', 'instagram']).default('tiktok'),
  display_name: z.string().max(200).nullable().optional(),
  followers: z.number().nullable().optional(),
  tier: z.string().max(20).nullable().optional(),
  engagement_rate: z.number().nullable().optional(),
  avg_views: z.number().nullable().optional(),
  days_since_last_post: z.number().nullable().optional(),
  region: z.string().max(60).nullable().optional(),
  region_confidence: z.string().max(20).nullable().optional(),
  niche_matched: z.number().nullable().optional(),
  niche_total: z.number().nullable().optional(),
  country: z.string().max(4).nullable().optional(),
  instagram_handle: z.string().max(120).nullable().optional(),
  profile_url: z.string().max(400).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
})

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  note: z.string().max(1000).nullable().optional(),
  entries: z.array(EntrySchema).min(1).max(500),
  /** Append into an existing shortlist instead of creating a new one. */
  shortlist_id: z.string().uuid().optional(),
})

export async function GET() {
  const authClient = await createServerClient()
  const { unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  const service = createServiceClient()
  const clientId = await getActiveClientId().catch(() => null)

  let query = service
    .from('sw_kol_shortlists')
    .select('id, name, note, entries, client_id, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100)
  if (clientId) query = query.eq('client_id', clientId)

  const { data, error } = await query
  if (error) {
    // Almost always "table does not exist" — migration 026 not run yet. Say so
    // plainly instead of showing an empty list that looks like no shortlists.
    return NextResponse.json({ ok: false, error: error.message, shortlists: [] }, { status: 200 })
  }
  return NextResponse.json({ ok: true, shortlists: data ?? [] })
}

export async function POST(req: Request) {
  const authClient = await createServerClient()
  const { user, unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Nama shortlist dan minimal 1 KOL wajib diisi.' }, { status: 400 })
  }
  const input = parsed.data

  const service = createServiceClient()
  const clientId = await getActiveClientId().catch(() => null)
  const now = new Date().toISOString()

  if (input.shortlist_id) {
    const { data: existing, error: readErr } = await service
      .from('sw_kol_shortlists')
      .select('entries')
      .eq('id', input.shortlist_id)
      .maybeSingle()
    if (readErr || !existing) {
      return NextResponse.json({ ok: false, error: 'Shortlist-nya gak ketemu.' }, { status: 404 })
    }

    // Merge on handle+platform so adding the same creator twice updates their
    // snapshot rather than listing them again.
    const prev: z.infer<typeof EntrySchema>[] = Array.isArray(existing.entries) ? existing.entries : []
    const merged = [...prev]
    let added = 0
    for (const entry of input.entries) {
      const at = merged.findIndex((e) => e.handle === entry.handle && (e.platform ?? 'tiktok') === entry.platform)
      if (at >= 0) merged[at] = entry
      else {
        merged.push(entry)
        added++
      }
    }

    const { error } = await service
      .from('sw_kol_shortlists')
      .update({ entries: merged, updated_at: now })
      .eq('id', input.shortlist_id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: input.shortlist_id, total: merged.length, added })
  }

  const { data, error } = await service
    .from('sw_kol_shortlists')
    .insert({
      client_id: clientId,
      name: input.name,
      note: input.note ?? null,
      entries: input.entries,
      created_by: user.id,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Gagal simpan shortlist: ${error.message}. Pastikan migration 026 udah dijalanin.` },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true, id: data.id, total: input.entries.length, added: input.entries.length })
}

export async function DELETE(req: Request) {
  const authClient = await createServerClient()
  const { unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id wajib diisi' }, { status: 400 })

  const service = createServiceClient()
  const { error } = await service.from('sw_kol_shortlists').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
