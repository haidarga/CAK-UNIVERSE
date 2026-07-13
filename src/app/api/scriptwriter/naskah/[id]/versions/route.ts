import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/cakgpt/supabase/server'
import { requireUser } from '@/lib/cakgpt/auth'
import { BlockSchema } from '@/lib/cakgpt/schemas'
import { z } from 'zod'
import { runRuleBasedQc } from '@/lib/cakgpt/qc-rules'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { user, unauthorized } = await requireUser(supabase)
  if (unauthorized) return unauthorized

  const { data: naskah } = await supabase.from('naskah').select('id').eq('id', id).eq('created_by', user.id).maybeSingle()
  if (!naskah) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('naskah_versions').select('*').eq('naskah_id', id).order('version_no', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, versions: data })
}

const ManualEditBody = z.object({
  body: z.array(BlockSchema).min(1).max(60),
  change_summary: z.string().max(500).optional(),
})

// Writer's manual edit — creates a NEW version (nothing overwrites in place,
// ARCHITECTURE.md §1) and triggers a fresh rule-based QC pass (the critic
// pass is intentionally skipped here to keep manual edits cheap/instant;
// use /qc/rerun to force a full re-critique).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authClient = await createServerClient()
  const { user, unauthorized } = await requireUser(authClient)
  if (unauthorized) return unauthorized

  let json: unknown
  try { json = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const parsed = ManualEditBody.safeParse(json)
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 })

  const { data: naskah } = await authClient
    .from('naskah').select('id, persona_id, current_version_id').eq('id', id).eq('created_by', user.id).maybeSingle()
  if (!naskah) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })

  const { data: currentVersion } = await authClient
    .from('naskah_versions').select('hook_rubric_id, hook_justification, format_meta, generation_meta')
    .eq('id', naskah.current_version_id).maybeSingle()

  const { data: persona } = await authClient
    .from('personas').select('banned_words, required_words').eq('id', naskah.persona_id).eq('created_by', user.id).maybeSingle()

  const service = createServiceClient()
  const { data: version, error: versionErr } = await service.rpc('create_naskah_version', {
    p_naskah_id: id,
    p_body: parsed.data.body,
    p_hook_rubric_id: currentVersion?.hook_rubric_id ?? null,
    p_hook_justification: currentVersion?.hook_justification ?? null,
    p_format_meta: currentVersion?.format_meta ?? {},
    p_generation_meta: currentVersion?.generation_meta ?? null,
    p_created_via: 'writer_edit',
    p_change_summary: parsed.data.change_summary ?? null,
    p_created_by: user.id,
  })
  if (versionErr || !version) return NextResponse.json({ ok: false, error: versionErr?.message || 'failed to create version' }, { status: 500 })

  if (persona) {
    const ruleFlags = runRuleBasedQc({ blocks: parsed.data.body, bannedWords: persona.banned_words || [], requiredWords: persona.required_words || [] })
    if (ruleFlags.length > 0) {
      const blockById = new Map(parsed.data.body.map((b) => [b.block_id, b]))
      await service.from('qc_flags').insert(ruleFlags.map((f) => {
        const block = blockById.get(f.block_id)!
        return {
          naskah_id: id,
          naskah_version_id: version.id,
          target_ref: { block_id: f.block_id, display_snapshot: { section_key: block.section_key, shot_no: block.shot_no, line_no: block.line_no } },
          category: f.category,
          severity: f.severity,
          message: f.message,
          evidence: f.evidence || null,
          source: 'auto_rule',
        }
      }))
    }
  }

  return NextResponse.json({ ok: true, version })
}
