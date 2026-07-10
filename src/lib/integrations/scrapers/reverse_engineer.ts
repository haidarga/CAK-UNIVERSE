import { runLLM } from "@/lib/llm";
import { admin } from "@/lib/supabase";
import type { ContentBenchmark } from "@/lib/types";

interface ReverseEngineerResult {
  topic: string;
  angle: string;
  hook: string;
  cta: string;
  shot_breakdown: Array<{ description: string; duration?: number }>;
}

/**
 * Extracts structured content strategy from a given Social Media URL.
 * Assumes a scraper sidecar handles the actual video download/transcription.
 */
export async function reverseEngineerVideo(
  brandId: string,
  sourceUrl: string,
  transcript: string,
  videoDescription: string
): Promise<{ success: boolean; data?: ContentBenchmark; error?: string }> {
  
  const systemPrompt = `You are an expert Social Media Content Strategist and Video Editor.
Analyze the provided video transcript and visual description, and extract the content strategy into strict JSON.`;

  const prompt = `Analyze this video:
URL: ${sourceUrl}
Description: ${videoDescription}
Transcript: ${transcript}

Return a JSON object with this exact structure:
{
  "topic": "The main topic or subject matter",
  "angle": "The unique angle or emotional approach taken",
  "hook": "The exact hook used (first 3-5 seconds)",
  "cta": "The call to action used at the end",
  "shot_breakdown": [
    { "description": "shot 1 visual description" },
    { "description": "shot 2 visual description" }
  ]
}`;

  try {
    const llmRes = await runLLM({
      system: systemPrompt,
      prompt,
      json: true,
      maxTokens: 1024,
      // Gemini 1.5 Pro is ideal for complex extraction if multimodal is passed
      // For now we assume transcript is passed in from the scraper
    });

    const parsed = JSON.parse(llmRes.text) as ReverseEngineerResult;

    // Save to database
    const { data, error } = await admin()
      .from("content_benchmarks")
      .insert({
        brand_id: brandId,
        source_url: sourceUrl,
        platform: sourceUrl.includes("tiktok") ? "tiktok" : "instagram",
        extracted_topic: parsed.topic,
        extracted_angle: parsed.angle,
        extracted_hook: parsed.hook,
        extracted_cta: parsed.cta,
        shot_breakdown: parsed.shot_breakdown,
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, data: data as ContentBenchmark };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
