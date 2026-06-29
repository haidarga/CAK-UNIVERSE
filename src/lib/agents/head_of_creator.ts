// ============================================================
// HeadOfCreatorAgent — script executability review + video QC.
//
// reviewScript: gate a written script on whether it can actually
//   be produced; advance to `script_reviewed` or bounce back.
// qcVideo: judge a produced video against brand standards and
//   emit a structured QCReport.
// ============================================================
import { BaseAgent } from "@/lib/agents/base";
import { admin, nowIso } from "@/lib/supabase";
import type { Brand, ContentPipeline, QCReport } from "@/lib/types";

export const SCRIPT_REVIEW_SYSTEM = `You are the Head of Creator. You review draft scripts for EXECUTABILITY before they go into production.

Judge whether the script can realistically be shot and edited:
- Are the scenes/shots filmable with a single creator + phone?
- Is the pacing right for short-form (no overlong monologues)?
- Is the hook strong in the first 2 seconds?
- Is the CTA clear and natural?

Respond with ONLY this JSON:
{ "executable": boolean, "score": number (0-100), "issues": string[], "recommendations": string[], "feedback": string }`;

export const VIDEO_QC_SYSTEM = `You are the Head of Creator performing final QUALITY CONTROL on a produced video, described in text.

Evaluate against brand standards. Score each dimension 0-100. Decide pass/fail (a video passes only if it is on-brand, hooks fast, and has acceptable visual quality).

Respond with ONLY this JSON (matching the QCReport shape):
{
  "passed": boolean,
  "score": number,
  "hook_strength": number,
  "brand_voice_match": number,
  "visual_quality": number,
  "issues": string[],
  "recommendations": string[],
  "creator_feedback": string
}`;

interface ScriptReviewResult {
  executable: boolean;
  score: number;
  issues: string[];
  recommendations: string[];
  feedback: string;
}

export class HeadOfCreatorAgent extends BaseAgent {
  constructor() {
    super("head_of_creator");
  }

  /** Review a script for executability; advance or bounce the pipeline. */
  async reviewScript(pipelineId: string) {
    const { data: pipeline } = await admin()
      .from("content_pipeline")
      .select("*, brands(*)")
      .eq("id", pipelineId)
      .single();

    if (!pipeline) return { success: false, error: `Pipeline ${pipelineId} not found` };

    const row = pipeline as ContentPipeline & { brands: Brand | null };
    if (!row.script?.text) {
      return { success: false, error: `Pipeline ${pipelineId} has no script to review` };
    }

    const prompt = `BRAND: ${row.brands?.name ?? "(unknown)"}
FORMAT: ${row.content_format ?? "short-form video"}

SCRIPT:
${row.script.text}

Review for executability.`;

    const result = await this.run<ScriptReviewResult>({
      system: SCRIPT_REVIEW_SYSTEM,
      prompt,
      json: true,
      temperature: 0.3,
      maxTokens: 1024,
      brandId: row.brand_id,
      pipelineId,
      runType: "triggered",
    });

    if (!result.success || !result.data) {
      return { success: false, error: result.error ?? "Script review failed" };
    }

    const review = result.data;
    // Pass -> script_reviewed; fail -> bounce back to scripted for rewrite.
    const stage = review.executable ? "script_reviewed" : "scripted";

    await admin()
      .from("content_pipeline")
      .update({
        stage,
        qc_report: {
          passed: review.executable,
          score: review.score,
          issues: review.issues ?? [],
          recommendations: review.recommendations ?? [],
          creator_feedback: review.feedback,
        },
        updated_at: nowIso(),
      })
      .eq("id", pipelineId);

    return { success: true, executable: review.executable, stage, review, tokensUsed: result.tokensUsed };
  }

  /** Run final QC on a produced video (described in text). */
  async qcVideo(pipelineId: string, videoDescription: string) {
    const { data: pipeline } = await admin()
      .from("content_pipeline")
      .select("*, brands(*)")
      .eq("id", pipelineId)
      .single();

    if (!pipeline) return { success: false, error: `Pipeline ${pipelineId} not found` };

    const row = pipeline as ContentPipeline & { brands: Brand | null };
    const brand = row.brands;

    const prompt = `BRAND: ${brand?.name ?? "(unknown)"}
BRAND VOICE: ${brand?.guidelines ?? "(none)"}
TAGLINE: ${brand?.campaign_tagline ?? "(none)"}

SCRIPT:
${row.script?.text ?? "(no script on record)"}

PRODUCED VIDEO DESCRIPTION:
${videoDescription}

Run final QC.`;

    const result = await this.run<QCReport>({
      system: VIDEO_QC_SYSTEM,
      prompt,
      json: true,
      temperature: 0.3,
      maxTokens: 1024,
      brandId: row.brand_id,
      pipelineId,
      runType: "triggered",
    });

    if (!result.success || !result.data) {
      return { success: false, error: result.error ?? "Video QC failed" };
    }

    const report = result.data;
    const stage = report.passed ? "qc_passed" : "qc_failed";

    await admin()
      .from("content_pipeline")
      .update({
        stage,
        qc_report: report,
        qc_reviewed_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", pipelineId);

    return { success: true, passed: report.passed, stage, report, tokensUsed: result.tokensUsed };
  }
}
