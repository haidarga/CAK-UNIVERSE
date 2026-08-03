import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { BrandContextSchema } from '@/lib/cakgpt/brand-context'

// Client / Brand CRUD (decision #1). Owner-scoped, soft-disable only —
// same shape as /api/personas.
export async function GET() {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const { data, error } = await supabase
    .from('sw_clients')
    .select('*')
    .eq('created_by', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, clients: data })
}

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ ok: false, error: 'name is required' }, { status: 400 })

  // Validated (not passed through raw) because this JSONB is interpolated into
  // the generation prompt and its two list fields become QC blockers.
  const parsedContext = BrandContextSchema.safeParse(body.brand_context ?? {})
  if (!parsedContext.success) {
    return NextResponse.json({ ok: false, error: `brand_context invalid: ${parsedContext.error.message}` }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('sw_clients')
    .insert({
      created_by: user.id,
      name,
      notes: body.notes ? String(body.notes) : null,
      brand_context: parsedContext.data,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, client: data })
}
