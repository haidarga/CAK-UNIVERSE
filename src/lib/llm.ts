// ============================================================
// Unified LLM layer — route any agent to Claude or Gemini.
// One call shape, two providers, configurable per-agent or via env.
// ============================================================
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
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
}

export interface LLMResult {
  text: string;
  provider: LLMProvider;
  model: string;
  tokensUsed: number;
}

function defaultProvider(): LLMProvider {
  const p = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();
  return p === "gemini" ? "gemini" : "anthropic";
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
  const client = gemini().getGenerativeModel({
    model,
    systemInstruction: req.system,
    generationConfig: {
      maxOutputTokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.7,
      ...(req.json ? { responseMimeType: "application/json" } : {}),
      // responseSchema only takes effect alongside responseMimeType "application/json".
      ...(req.json && req.responseSchema ? { responseSchema: req.responseSchema } : {}),
    },
  });

  const res = await client.generateContent(req.prompt);
  const text = res.response.text();
  const usage = res.response.usageMetadata;

  return {
    text,
    provider: "gemini",
    model,
    tokensUsed: usage?.totalTokenCount ?? 0,
  };
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
