import type { SupabaseClient } from '@supabase/supabase-js'
import { callGeminiJSON, LLMError } from '@/lib/cakgpt/llm'
import { buildIdeaPrompt, IDEA_RESPONSE_SCHEMA, type HookRubricForPrompt } from '@/lib/cakgpt/prompts'
import { IdeaOutputSchema } from '@/lib/cakgpt/schemas'
import { getGeminiApiKey } from '@/lib/cakgpt/settings'

export type GenerateIdeasParams = {
  supabase: SupabaseClient
  createdBy: string
  personaId?: string
  briefId?: string
  adHocContext?: string
  count?: number
}

export type GenerateIdeasResult =
  | { ok: true; ideaSessionId: string; angles: unknown[] }
  | { ok: false; error: string }

// Idea/brainstorm mode (ARCHITECTURE.md §7) — deliberately lighter than the
// main generation pipeline: short output, cheaper model call, no auto-QC
// (nothing "final" exists yet to flag), not versioned.
export async function generateIdeas(params: GenerateIdeasParams): Promise<GenerateIdeasResult> {
  const { supabase, createdBy } = params
  if (!params.briefId && !params.adHocContext) {
    return { ok: false, error: 'either briefId or adHocContext is required' }
  }

  let persona = null as Awaited<ReturnType<typeof fetchPersona>> | null
  if (params.personaId) {
    persona = await fetchPersona(supabase, params.personaId, createdBy)
    if (!persona) return { ok: false, error: 'persona not found' }
  }

  let brief = null as Awaited<ReturnType<typeof fetchBrief>> | null
  if (params.briefId) {
    brief = await fetchBrief(supabase, params.briefId, createdBy)
    if (!brief) return { ok: false, error: 'brief not found' }
  }

  const { data: hookRubrics } = await supabase
    .from('sw_hook_rubrics').select('slug, name, description, example').eq('is_active', true).order('sort_order')

  let ideas
  try {
    const apiKey = await getGeminiApiKey(supabase, createdBy)
    const prompt = buildIdeaPrompt({
      persona,
      brief,
      adHocContext: params.adHocContext || null,
      hookRubrics: (hookRubrics as HookRubricForPrompt[]) || [],
      count: Math.max(3, Math.min(12, params.count || 8)),
    })
    const raw = await callGeminiJSON({ apiKey, prompt, responseSchema: IDEA_RESPONSE_SCHEMA, temperature: 0.9, maxOutputTokens: 4000 })
    ideas = IdeaOutputSchema.parse(raw)
  } catch (e) {
    const msg = e instanceof LLMError ? e.message : e instanceof Error ? e.message : 'idea generation failed'
    return { ok: false, error: msg }
  }

  const { data: row, error } = await supabase
    .from('sw_idea_sessions')
    .insert({
      created_by: createdBy,
      persona_id: params.personaId || null,
      brief_id: params.briefId || null,
      ad_hoc_context: params.adHocContext || null,
      angles: ideas.angles,
    })
    .select('id')
    .single()
  if (error || !row) return { ok: false, error: `failed to save idea session: ${error?.message}` }

  return { ok: true, ideaSessionId: row.id, angles: ideas.angles }
}

async function fetchPersona(supabase: SupabaseClient, id: string, createdBy: string) {
  const { data } = await supabase
    .from('sw_personas')
    .select('id, name, tone, diction_quirks, banned_words, required_words, sample_lines, red_flags')
    .eq('id', id).eq('created_by', createdBy).maybeSingle()
  return data
}

async function fetchBrief(supabase: SupabaseClient, id: string, createdBy: string) {
  const { data } = await supabase
    .from('sw_strategist_briefs')
    .select('id, title, product, platform, fields')
    .eq('id', id).eq('created_by', createdBy).maybeSingle()
  return data
}
