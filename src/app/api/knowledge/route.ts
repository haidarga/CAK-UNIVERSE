import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'

// GET /api/knowledge — list all knowledge items for user
export async function GET(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const sourceType = searchParams.get('source_type')?.trim()

  let query = supabase
    .from('sw_knowledge')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })

  if (sourceType) {
    query = query.eq('source_type', sourceType)
  }

  if (q) {
    query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`)
  }

  const { data, error } = await query

  if (error) {
    // If sw_knowledge table does not exist yet in DB, return empty array gracefully
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return NextResponse.json({ ok: true, items: [] })
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, items: data || [] })
}

// POST /api/knowledge — save new knowledge item
export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { title, content, source_type = 'manual', source_url = null, tags = [], metadata = {} } = body

  if (!title?.trim()) {
    return NextResponse.json({ ok: false, error: 'Judul knowledge wajib diisi' }, { status: 400 })
  }
  if (!content?.trim()) {
    return NextResponse.json({ ok: false, error: 'Konten knowledge wajib diisi' }, { status: 400 })
  }

  const row = {
    created_by: user.id,
    title: String(title).trim().slice(0, 200),
    content: String(content).trim(),
    source_type: String(source_type || 'manual').trim(),
    source_url: source_url ? String(source_url).trim() : null,
    tags: Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [],
    metadata: typeof metadata === 'object' ? metadata : {},
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('sw_knowledge')
    .insert(row)
    .select('*')
    .single()

  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return NextResponse.json({
        ok: false,
        error: "Tabel 'sw_knowledge' belum dibuat di Supabase. Silakan jalankan SQL migration 019_sw_knowledge.sql di Supabase SQL Editor."
      }, { status: 400 })
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, item: data })
}
