// ============================================================
// ScriptWriterAgent — turns a briefed pipeline into a script.
//
// Generates a per-brand script via the LLM, then runs the PURE
// guardrail check (guardrails.ts) deterministically. Prohibited
// claims route the pipeline to `guardrail_review`; clean scripts
// advance to `scripted`.
// ============================================================
import { BaseAgent } from "@/lib/agents/base";
import { admin, nowIso } from "@/lib/supabase";
import { checkGuardrails } from "@/lib/guardrails";
import { notifyPipelineEvent } from "@/lib/notify-events";
import type { Brand, ContentPipeline, Hook, Persona } from "@/lib/types";

/** Build a brand-specific system prompt with guardrails + approved claims. */
export function getScriptWriterPrompt(brand: Brand): string {
  const prohibited = (brand.guardrails ?? []).map((g) => `- ${g}`).join("\n") || "- (none specified)";
  const approved = (brand.approved_claims ?? []).map((c) => `- ${c}`).join("\n") || "- (none specified)";

  return `You are the Script Writer for the brand "${brand.name}".

BRAND VOICE & GUIDELINES:
${brand.guidelines ?? "(no specific guidelines provided)"}

CAMPAIGN TAGLINE: ${brand.campaign_tagline ?? "(none)"}

SCRIPT FORMAT (follow exactly):
${brand.script_format ?? "Hook -> Body -> CTA. Keep it punchy and platform-native."}

CTA RULES:
${brand.cta_rules ?? "End with a clear, natural call to action."}

APPROVED CLAIMS (you MAY use these):
${approved}

PROHIBITED CLAIMS (NEVER use these phrases or their meaning):
${prohibited}

Write a complete, ready-to-shoot short-form video script. Use natural spoken language for the persona. Do NOT include any prohibited claim. Output ONLY the script text — no headings, no commentary.`;
}

export class ScriptWriterAgent extends BaseAgent {
  constructor() {
    super("script_writer");
  }

  /** Generate, guardrail-check, and persist a script for a pipeline. */
  async generateScript(pipelineId: string) {
    const { data: pipeline } = await admin()
      .from("content_pipeline")
      .select("*, brands(*), personas(*)")
      .eq("id", pipelineId)
      .single();

    if (!pipeline) {
      return { success: false, error: `Pipeline ${pipelineId} not found` };
    }

    const row = pipeline as ContentPipeline & {
      brands: Brand | null;
      personas: Persona | null;
    };
    const brand = row.brands;
    const persona = row.personas;

    if (!brand) {
      return { success: false, error: `Brand for pipeline ${pipelineId} not found` };
    }

    const hooks = await this.getTopHooks(brand.id, row.emotional_pillar);

    const system = getScriptWriterPrompt(brand);
    const prompt = this.buildPrompt(row, persona, hooks);

    const result = await this.run<string>({
      system,
      prompt,
      json: false,
      temperature: 0.8,
      maxTokens: 2048,
      brandId: brand.id,
      pipelineId,
      runType: "triggered",
    });

    if (!result.success || !result.data) {
      return { success: false, error: result.error ?? "Script generation failed" };
    }

    const scriptText = result.data.trim();

    // Deterministic guardrail check.
    const guard = checkGuardrails(scriptText, brand.guardrails ?? []);

    if (!guard.passed) {
      await admin()
        .from("content_pipeline")
        .update({
          stage: "guardrail_review",
          script: { text: scriptText, version: 1 },
          script_version: 1,
          qc_report: {
            passed: false,
            score: 0,
            issues: guard.violations,
            recommendations: ["Rewrite to remove prohibited claims."],
            guardrail_flag: true,
            needs_review: true,
            violations: guard.violations,
          },
          updated_at: nowIso(),
        })
        .eq("id", pipelineId);

      await notifyPipelineEvent({
        event: "Naskah kena guardrail",
        level: "warn",
        brandName: brand.name,
        brandId: brand.id,
        title: row.content_direction?.title ?? null,
        detail: `Klaim terlarang: ${guard.violations.join(", ")}`,
        pipelineId,
      });

      return {
        success: true,
        guardrailFlag: true,
        violations: guard.violations,
        stage: "guardrail_review" as const,
        script: { text: scriptText, version: 1 },
        tokensUsed: result.tokensUsed,
      };
    }

    await admin()
      .from("content_pipeline")
      .update({
        stage: "scripted",
        script: { text: scriptText, version: 1 },
        script_version: 1,
        updated_at: nowIso(),
      })
      .eq("id", pipelineId);

    await notifyPipelineEvent({
      event: "Naskah siap (Jebret)",
      level: "success",
      brandName: brand.name,
      brandId: brand.id,
      title: row.content_direction?.title ?? null,
      pipelineId,
    });

    return {
      success: true,
      guardrailFlag: false,
      stage: "scripted" as const,
      script: { text: scriptText, version: 1 },
      tokensUsed: result.tokensUsed,
    };
  }

  private buildPrompt(
    pipeline: ContentPipeline,
    persona: Persona | null,
    hooks: Hook[],
  ): string {
    const dir = pipeline.content_direction;
    const hookLines =
      hooks.length > 0
        ? hooks.map((h) => `- "${h.hook_text}" (${h.emotional_pillar})`).join("\n")
        : "- (no top hooks available — craft an original hook)";

    return `CONTENT BRIEF:
Title: ${dir?.title ?? "(untitled)"}
Emotional pillar: ${pipeline.emotional_pillar ?? dir?.emotional_pillar ?? "(unspecified)"}
Format: ${pipeline.content_format ?? dir?.format ?? "short-form video"}
Emotional angle: ${dir?.emotional_angle ?? "(unspecified)"}
Product featured: ${dir?.product_featured ?? "(none)"}
Narrative theme: ${dir?.narrative_theme ?? "(none)"}
Suggested hook: ${dir?.hook ?? "(craft your own)"}

PERSONA:
Name: ${persona?.name ?? "(brand voice)"}
Archetype: ${persona?.archetype ?? "(none)"}
Tone of voice: ${persona?.tone_of_voice ?? "(brand default)"}
Language: ${persona?.language ?? "en"}

TOP-PERFORMING HOOKS for this pillar (use one as inspiration):
${hookLines}

Write the script now.`;
  }

  private async getTopHooks(brandId: string, pillar: string | null): Promise<Hook[]> {
    let q = admin()
      .from("hooks")
      .select("*")
      .eq("brand_id", brandId)
      .order("performance_score", { ascending: false })
      .limit(5);

    if (pillar) q = q.eq("emotional_pillar", pillar);

    const { data } = await q;
    return (data ?? []) as Hook[];
  }
}
