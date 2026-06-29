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
  | "task_breakdown" // break a goal into structured subtasks
  | "qc_explain" // explain a QC issue + how to fix
  | "issue_triage" // triage a reported dev problem
  | "summarize" // summarize long text
  | "rewrite" // rewrite in a requested tone
  | "generic"; // freeform assistant

const MAX_INPUT = 8000;
const MAX_CONTEXT = 4000;

const SYSTEM: Record<AssistTool, string> = {
  script_enhance: `You are an elite short-form script editor for an Indonesian UGC agency. Tighten the hook, sharpen pacing, keep the persona voice, and respect brand guardrails in the context. Return only the improved script.`,
  script_hook: `You generate scroll-stopping TikTok hooks (each <10 words, Indonesian unless context says otherwise). Return a JSON array of 6 hook strings only.`,
  strategy_suggest: `You are a content strategist. From the brand + trend context, propose concrete content directions. Return a JSON array of objects {title, emotional_pillar, format, hook, narrative_theme} (5 items).`,
  task_breakdown: `You break a goal into a clear, ordered set of actionable subtasks. Return a JSON array of objects {title, type, priority} where type is one of content|strategy|script|production|qc|account|dev|general and priority is 1(urgent)..4(low). 3-8 items.`,
  qc_explain: `You are a Head of Creator. Given a QC issue, explain in 1-2 sentences why it matters and exactly how the creator should fix it. Plain, direct, actionable. Return only the explanation.`,
  issue_triage: `You triage software problem reports. Given a description, return JSON {severity: "low"|"medium"|"high"|"critical", area: "frontend"|"backend"|"agent"|"infra"|"data"|"general", suggested_title: string, first_steps: string}.`,
  summarize: `Summarize the input crisply, preserving key facts and numbers. Return only the summary.`,
  rewrite: `Rewrite the input per the instruction in the context (tone/length/audience). Return only the rewritten text.`,
  generic: `You are a helpful, concise work assistant embedded in an agency platform. Answer directly and practically.`,
};

// Tools whose output is structured JSON (parsed before returning).
const JSON_TOOLS: AssistTool[] = ["script_hook", "strategy_suggest", "task_breakdown", "issue_triage"];

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
    maxTokens: 2048,
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
