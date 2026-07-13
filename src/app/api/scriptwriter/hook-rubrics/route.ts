import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'

// Read-only — hook_rubrics is a service-role-managed reference table (see
// supabase/seed.sql). Any authenticated user can read it (RLS: auth.uid() is not null).
export async function GET() {
  const supabase = await createServerClient()
  const { unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const { data, error } = await supabase
    .from('hook_rubrics').select('*').eq('is_active', true).order('sort_order', { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, hookRubrics: data })
}
