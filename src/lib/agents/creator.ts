// ============================================================
// CreatorAgent — converts a reviewed script into production params.
//
// Emits a per-shot Seedance/CAKAI generation plan. CRITICAL: each
// shot is its OWN isolated generation prompt — Seedance cannot read
// a storyboard grid as a temporal sequence, so we never pack
// multiple beats into one prompt.
// ============================================================
import { BaseAgent } from "@/lib/agents/base";
import { admin, nowIso } from "@/lib/supabase";
import type { Brand, ContentPipeline, Persona, Shot } from "@/lib/types";

export const CREATOR_SYSTEM = `You are the Creator. You convert a final script into a SHOT-BY-SHOT production plan for the Seedance (CAKAI) AI video generator.

CRITICAL SEEDANCE RULES:
- Each shot is a SEPARATE, self-contained generation prompt. Seedance generates ONE continuous clip per prompt.
- NEVER write a single prompt that describes multiple sequential moments (Seedance cannot parse a storyboard grid as a temporal sequence — it will blend or ignore beats).
- Each shot's "cakai_prompt" must fully describe the scene on its own: subject, action, camera, lighting, setting, mood. No references to "previous shot" or "then".
- Keep each shot 3-8 seconds.

For every shot, output: shot_number, duration_seconds, cakai_prompt, persona_voice_line, visual_notes, capcut_transition, audio_notes.

Respond with ONLY a JSON ARRAY of shot objects.`;

export class CreatorAgent extends BaseAgent {
  constructor() {
    super("creator");
  }

  /** Generate per-shot production params from the reviewed script. */
  async generateProductionParams(pipelineId: string) {
    const { data: pipeline } = await admin()
      .from("content_pipeline")
      .select("*, brands(*), personas(*)")
      .eq("id", pipelineId)
      .single();

    if (!pipeline) return { success: false, error: `Pipeline ${pipelineId} not found` };

    const row = pipeline as ContentPipeline & {
      brands: Brand | null;
      personas: Persona | null;
    };

    if (!row.script?.text) {
      return { success: false, error: `Pipeline ${pipelineId} has no script to produce` };
    }

    const brand = row.brands;
    const persona = row.personas;

    const prompt = `BRAND: ${brand?.name ?? "(unknown)"}
FORMAT: ${row.content_format ?? "short-form video"}
PERSONA: ${persona?.name ?? "(brand voice)"} | tone: ${persona?.tone_of_voice ?? "(default)"} | language: ${persona?.language ?? "en"}

SCRIPT:
${row.script.text}

Break this into discrete shots. Remember: one isolated cakai_prompt per shot.`;

    const result = await this.run<Shot[]>({
      system: CREATOR_SYSTEM,
      prompt,
      json: true,
      temperature: 0.6,
      maxTokens: 4096,
      brandId: row.brand_id,
      pipelineId,
      runType: "triggered",
    });

    if (!result.success || !result.data) {
      return { success: false, error: result.error ?? "Production param generation failed" };
    }

    const shots = Array.isArray(result.data) ? result.data : [];

    await admin()
      .from("content_pipeline")
      .update({
        stage: "produced",
        production_params: { shots, raw_output: result.raw ?? "" },
        updated_at: nowIso(),
      })
      .eq("id", pipelineId);

    return { success: true, stage: "produced" as const, shots, tokensUsed: result.tokensUsed };
  }
}
