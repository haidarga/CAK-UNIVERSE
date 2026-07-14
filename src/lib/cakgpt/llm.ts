// SHIM (CAKGPT port): route CAKGPT's callGeminiJSON through the ecosystem's
// unified runLLM (Claude/Gemini per LLM_PROVIDER env). Signature preserved so
// generation/extraction/idea code is unchanged. apiKey is accepted but unused
// (runLLM uses env keys). responseSchema IS forwarded to runLLM, which passes
// it to Gemini's generationConfig — without this the model is free to choose
// its own JSON shape (e.g. a bare array instead of the {briefs:[...]} the
// caller's Zod schema expects), which is exactly what was happening before.
import { runLLM, extractJson } from "@/lib/llm";

export class LLMError extends Error {}

type GeminiSchema = Record<string, unknown>;

export async function callGeminiJSON(opts: {
  apiKey: string;
  prompt: string;
  responseSchema: GeminiSchema;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<unknown> {
  try {
    const res = await runLLM({
      system: "You are a precise assistant. Respond with ONLY valid JSON matching the requested shape — no markdown fences, no commentary.",
      prompt: opts.prompt,
      json: true,
      responseSchema: opts.responseSchema,
      temperature: opts.temperature ?? 0.7,
      maxTokens: opts.maxOutputTokens ?? 8000,
    });
    return extractJson(res.text);
  } catch (e) {
    throw new LLMError(e instanceof Error ? e.message : "LLM call failed");
  }
}
