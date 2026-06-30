// ============================================================
// Universal AI Assist — the "✨ enhance" affordance behind every tool.
// One entrypoint, many presets, provider-agnostic (Claude/Gemini).
// Used inline across work surfaces so every role gets AI help in place.
// ============================================================
import { runLLM, extractJson, type LLMProvider } from "./llm";

export type AssistTool =
  | "script_enhance" // polish/tighten a script draft
  | "script_hook" // generate punchy hook options
  | "strategy_suggest" // suggest content directions from context
  | "viral_check" // judge a content idea's viral potential vs SGE insights
  | "task_breakdown" // break a goal into structured subtasks
  | "qc_explain" // explain a QC issue + how to fix
  | "issue_triage" // triage a reported dev problem
  | "summarize" // summarize long text
  | "rewrite" // rewrite in a requested tone
  | "warmup_comment" // human-like, non-template comment for warmup
  | "generic"; // freeform assistant

const MAX_INPUT = 8000;
const MAX_CONTEXT = 4000;

const SYSTEM: Record<AssistTool, string> = {
  script_enhance: `You are an elite short-form script editor for an Indonesian UGC agency. Tighten the hook, sharpen pacing, keep the persona voice, and respect brand guardrails in the context. Return only the improved script.`,
  script_hook: `You generate scroll-stopping TikTok hooks (each <10 words, Indonesian unless context says otherwise). Return a JSON array of 6 hook strings only.`,
  strategy_suggest: `You are a content strategist. From the brand + trend context, propose concrete content directions. Return a JSON array of objects {title, emotional_pillar, format, hook, narrative_theme} (5 items).`,
  viral_check: `You are a viral content strategist for an Indonesian UGC agency. The CONTEXT holds real "why things go viral" insights from Social Growth Engineers (titles + excerpts). The INPUT is a content idea/plan. Judge its viral potential and explain HOW to make it go viral, grounded in those SGE insights — do not invent mechanics that contradict them. Be specific and honest (a weak idea gets a low score). Return ONLY JSON: {"score": number 0-10, "verdict": one punchy Indonesian sentence, "strengths": string[] (2-4), "risks": string[] (1-3), "how_to_viral": string[] (3-5 concrete actionable steps in Indonesian — hook angle, format, structure, timing), "citations": string[] (exact titles of the SGE insights you leaned on)}.`,
  task_breakdown: `You break a goal into a clear, ordered set of actionable subtasks. Return a JSON array of objects {title, type, priority} where type is one of content|strategy|script|production|qc|account|dev|general and priority is 1(urgent)..4(low). 3-8 items.`,
  qc_explain: `You are a Head of Creator. Given a QC issue, explain in 1-2 sentences why it matters and exactly how the creator should fix it. Plain, direct, actionable. Return only the explanation.`,
  issue_triage: `You triage software problem reports. Given a description, return JSON {severity: "low"|"medium"|"high"|"critical", area: "frontend"|"backend"|"agent"|"infra"|"data"|"general", suggested_title: string, first_steps: string}.`,
  warmup_comment: `You are a real Indonesian Gen-Z/millennial social user leaving a casual comment on a TikTok/Reel. Given the video's caption/topic, write ONE short, natural, specific reaction comment (under 12 words). Vary your style every time — sometimes a reaction, a question, slang, or 1 emoji. NEVER generic/template phrases like "keren banget", "mantap kak", "nice content". Sound human and specific to the video. Return ONLY the comment text, no quotes.`,
  summarize: `Summarize the input crisply, preserving key facts and numbers. Return only the summary.`,
  rewrite: `Rewrite the input per the instruction in the context (tone/length/audience). Return only the rewritten text.`,
  generic: `You are a helpful, concise work assistant embedded in an agency platform. Answer directly and practically.`,
};

// Tools whose output is structured JSON (parsed before returning).
const JSON_TOOLS: AssistTool[] = ["script_hook", "strategy_suggest", "viral_check", "task_breakdown", "issue_triage"];

export interface AssistRequest {
  tool: AssistTool;
  input: string;
  /** Brand voice, guardrails, persona, trends, instruction, etc. */
  context?: string;
  provider?: LLMProvider;
  model?: string;
}

export interface AssistResult {
  tool: AssistTool;
  json: boolean;
  text: string;
  data?: unknown; // present for JSON tools
  tokensUsed: number;
  provider: string;
  model: string;
}

export async function aiAssist(req: AssistRequest): Promise<AssistResult> {
  const tool = (SYSTEM[req.tool] ? req.tool : "generic") as AssistTool;
  const json = JSON_TOOLS.includes(tool);

  const input = (req.input ?? "").slice(0, MAX_INPUT);
  const context = (req.context ?? "").slice(0, MAX_CONTEXT);

  const prompt = context ? `CONTEXT:\n${context}\n\n---\nINPUT:\n${input}` : input;

  const res = await runLLM({
    system: SYSTEM[tool],
    prompt,
    json,
    provider: req.provider,
    model: req.model,
    temperature: tool === "task_breakdown" || tool === "issue_triage" ? 0.3 : 0.7,
    // viral_check returns a multi-section JSON verdict; give it more headroom
    // so the JSON never truncates mid-array.
    maxTokens: tool === "viral_check" ? 3500 : 2048,
  });

  return {
    tool,
    json,
    text: res.text,
    data: json ? extractJson(res.text) : undefined,
    tokensUsed: res.tokensUsed,
    provider: res.provider,
    model: res.model,
  };
}
