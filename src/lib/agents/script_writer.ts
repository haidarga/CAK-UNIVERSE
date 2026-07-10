// ============================================================
// ScriptWriterAgent — turns a briefed pipeline into a script.
//
// Refactored to support Component-Based Generation (Block by Block)
// and Few-Shot Prompting via gold_examples.
// ============================================================
import { BaseAgent } from "@/lib/agents/base";
import { admin, nowIso } from "@/lib/supabase";
import { checkGuardrails } from "@/lib/guardrails";
import { notifyPipelineEvent } from "@/lib/notify-events";
import type { Brand, ContentPipeline, Persona, ScriptBlock } from "@/lib/types";

type BlockType = "hook" | "body" | "cta";

/** Build a brand-specific system prompt with guardrails + approved claims + few-shot examples. */
export function getScriptWriterPrompt(brand: Brand, persona: Persona | null): string {
  const prohibited = (brand.guardrails ?? []).map((g) => `- ${g}`).join("\n") || "- (none specified)";
  const approved = (brand.approved_claims ?? []).map((c) => `- ${c}`).join("\n") || "- (none specified)";
  
  let examplesText = "";
  if (persona && persona.gold_examples && persona.gold_examples.length > 0) {
    examplesText = `\nGOLD STANDARD EXAMPLES (Mirror this exact tone, vocabulary, and pacing):\n`;
    persona.gold_examples.forEach((ex, i) => {
      examplesText += `--- Example ${i + 1} ---\n${ex}\n`;
    });
  }

  return `You are the Script Writer for the brand "${brand.name}".

BRAND VOICE & GUIDELINES:
${brand.guidelines ?? "(no specific guidelines provided)"}

PERSONA:
Name: ${persona?.name ?? "(brand voice)"}
Archetype: ${persona?.archetype ?? "(none)"}
Tone of voice: ${persona?.tone_of_voice ?? "(brand default)"}
Language: ${persona?.language ?? "id"}
${examplesText}

CAMPAIGN TAGLINE: ${brand.campaign_tagline ?? "(none)"}

APPROVED CLAIMS (you MAY use these):
${approved}

PROHIBITED CLAIMS (NEVER use these phrases or their meaning):
${prohibited}

Output ONLY the requested block text. Do NOT include headings, commentary, or markdown blocks.`;
}

export class ScriptWriterAgent extends BaseAgent {
  constructor() {
    super("script_writer");
  }

  /** Generate a specific block (hook, body, or cta) for a pipeline. */
  async generateBlock(pipelineId: string, blockType: BlockType, contextDetails: string) {
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
    const brand = row.brands;
    const persona = row.personas;

    if (!brand) return { success: false, error: `Brand not found` };

    const system = getScriptWriterPrompt(brand, persona);
    const prompt = this.buildBlockPrompt(row, blockType, contextDetails);

    const result = await this.run<string>({
      system,
      prompt,
      json: false,
      temperature: 0.7,
      maxTokens: 1024, // Smaller maxTokens because we generate per block
      brandId: brand.id,
      pipelineId,
      runType: "triggered",
    });

    if (!result.success || !result.data) {
      return { success: false, error: result.error ?? `Failed to generate ${blockType}` };
    }

    const blockText = result.data.trim();

    // Guardrail check
    const guard = checkGuardrails(blockText, brand.guardrails ?? []);

    return {
      success: true,
      blockType,
      text: blockText,
      guardrailFlag: !guard.passed,
      violations: guard.violations,
      tokensUsed: result.tokensUsed,
    };
  }

  private buildBlockPrompt(pipeline: ContentPipeline, blockType: BlockType, contextDetails: string): string {
    const dir = pipeline.content_direction;
    
    let instructions = "";
    if (blockType === "hook") {
      instructions = `Write an engaging HOOK (first 3-5 seconds). Grab attention immediately based on the emotional angle.`;
    } else if (blockType === "body") {
      instructions = `Write the BODY of the script. Deliver the core message and value proposition clearly without being repetitive.`;
    } else if (blockType === "cta") {
      instructions = `Write a strong, natural Call To Action (CTA) to end the video.`;
    }

    return `CONTENT BRIEF:
Title: ${dir?.title ?? "(untitled)"}
Format: ${pipeline.content_format ?? dir?.format ?? "short-form video"}
Emotional angle: ${dir?.emotional_angle ?? "(unspecified)"}
Narrative theme: ${dir?.narrative_theme ?? "(none)"}

CONTEXT / BENCHMARKS:
${contextDetails}

TASK:
${instructions}
Write ONLY the spoken dialogue or visual text for this block.`;
  }
}
