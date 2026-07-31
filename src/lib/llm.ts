// ============================================================
// Unified LLM layer — route any agent to Claude or Gemini.
// One call shape, two providers, configurable per-agent or via env.
// ============================================================
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import { CLAUDE_MODEL } from "./constants";

export type LLMProvider = "anthropic" | "gemini";

export interface LLMRequest {
  system: string;
  prompt: string;
  /** Force the model toward strict JSON output. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Override the env default for this call. */
  provider?: LLMProvider;
  /** Override the model id for this call. */
  model?: string;
  /**
   * Gemini-only: a response schema (Gemini's subset of OpenAPI/JSON Schema —
   * type: "OBJECT"/"ARRAY"/"STRING" etc.) that constrains the exact shape of
   * the JSON response, not just that it's valid JSON. Without this, the model
   * is free to pick any shape it thinks fits the prompt (e.g. a bare array
   * when a caller expects `{items: [...]}`), which downstream Zod parsing
   * then rejects. Ignored by the Anthropic path (no equivalent param here).
   */
  responseSchema?: object;
  /**
   * Gemini-only: inline image parts (base64, no data: prefix) for multimodal
   * vision calls. Ignored by the Anthropic path — Claude vision uses a
   * different content-block format and no current caller needs it there.
   */
  images?: { mimeType: string; data: string }[];
  /**
   * Gemini-only: disable the model's internal "thinking" pass. Gemini 2.5
   * Flash uses part of the output token budget for hidden reasoning, which
   * adds 15-30s latency AND squeezes the room left for actual JSON output.
   * Set to true for bulk/batch calls where speed matters more than extra
   * reasoning depth. Has no effect on Anthropic.
   */
  disableThinking?: boolean;
  /** Per-request timeout in milliseconds. Defaults to 90_000 (90s). */
  timeoutMs?: number;
}

export interface LLMResult {
  text: string;
  provider: LLMProvider;
  model: string;
  tokensUsed: number;
}

function defaultProvider(): LLMProvider {
  const p = process.env.LLM_PROVIDER?.toLowerCase();
  if (p === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (p === "gemini") return "gemini";
  if (process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "gemini";
}

// ---- Anthropic ----
let _anthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

async function runAnthropic(req: LLMRequest): Promise<LLMResult> {
  const model = req.model || process.env.ANTHROPIC_MODEL || CLAUDE_MODEL;
  const system = req.json
    ? `${req.system}\n\nRespond with ONLY valid JSON. No markdown fences, no commentary.`
    : req.system;

  const res = await anthropic().messages.create({
    model,
    max_tokens: req.maxTokens ?? 4096,
    temperature: req.temperature ?? 0.7,
    system,
    messages: [{ role: "user", content: req.prompt }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return {
    text,
    provider: "anthropic",
    model,
    tokensUsed: (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0),
  };
}

// ---- Gemini ----
let _gemini: GoogleGenerativeAI | null = null;
function gemini(): GoogleGenerativeAI {
  if (!_gemini) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
    _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _gemini;
}

async function runGemini(req: LLMRequest): Promise<LLMResult> {
  const model = req.model || process.env.GEMINI_MODEL || "gemini-2.5-flash";

  // Build generation config. When disableThinking is set, add
  // thinkingConfig.thinkingBudget = 0 so gemini-2.5-flash skips its internal
  // reasoning pass — saves 15-30s latency per call and frees the entire output
  // budget for actual JSON content instead of hidden thought tokens.
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: req.maxTokens ?? 4096,
    temperature: req.temperature ?? 0.7,
    ...(req.json ? { responseMimeType: "application/json" } : {}),
    ...(req.json && req.responseSchema ? { responseSchema: req.responseSchema } : {}),
  };
  if (req.disableThinking) {
    (generationConfig as Record<string, unknown>).thinkingConfig = { thinkingBudget: 0 };
  }

  const client = gemini().getGenerativeModel({
    model,
    systemInstruction: req.system,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- thinkingConfig is not in SDK types yet
    generationConfig: generationConfig as any,
  });

  // Wrap in a timeout so a stuck Gemini call doesn't hang the entire Vercel
  // function until maxDuration. Default 90s leaves headroom for the 120s cap.
  const timeoutMs = req.timeoutMs ?? 90_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Multimodal: when images are present, build a Content with inlineData
    // parts + the text prompt instead of the plain-string overload.
    const requestOptions = { signal: controller.signal } as { signal: AbortSignal };
    const res = req.images?.length
      ? await client.generateContent(
          {
            contents: [
              {
                role: "user",
                parts: [
                  ...req.images.map((img): Part => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
                  { text: req.prompt },
                ],
              },
            ],
          },
          requestOptions as never,
        )
      : await client.generateContent(req.prompt, requestOptions as never);
    const text = res.response.text();
    const usage = res.response.usageMetadata;

    return {
      text,
      provider: "gemini",
      model,
      tokensUsed: usage?.totalTokenCount ?? 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Call the configured (or overridden) LLM provider. */
export async function runLLM(req: LLMRequest): Promise<LLMResult> {
  const provider = req.provider || defaultProvider();
  return provider === "gemini" ? runGemini(req) : runAnthropic(req);
}

/**
 * Robustly extract a JSON object/array from a model response.
 * Handles ```json fences, leading prose, and trailing text.
 */
export function extractJson<T = unknown>(raw: string): T {
  let s = raw.trim();

  // Strip code fences
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  // Find first balanced JSON value
  const start = s.search(/[[{]/);
  if (start === -1) throw new Error(`No JSON found in LLM output: ${raw.slice(0, 200)}`);

  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        return JSON.parse(s.slice(start, i + 1)) as T;
      }
    }
  }
  throw new Error(`Unterminated JSON in LLM output: ${raw.slice(0, 200)}`);
}
