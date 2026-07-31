import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'ID is required' }, { status: 400 })

  const { error } = await supabase
    .from('sw_knowledge')
    .delete()
    .eq('id', id)
    .eq('created_by', user.id)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'ID is required' }, { status: 400 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const patch: Record<string, any> = { updated_at: new Date().toISOString() }
  if (body.title != null) patch.title = String(body.title).trim()
  if (body.content != null) patch.content = String(body.content).trim()
  if (Array.isArray(body.tags)) patch.tags = body.tags
  if (body.metadata != null) patch.metadata = body.metadata

  const { data, error } = await supabase
    .from('sw_knowledge')
    .update(patch)
    .eq('id', id)
    .eq('created_by', user.id)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, item: data })
}
