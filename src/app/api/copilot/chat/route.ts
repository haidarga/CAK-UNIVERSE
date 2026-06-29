// ============================================================
// POST /api/copilot/chat — page-aware AI Copilot conversation.
// body { messages, route?, pageContext?, memberRole? }
// Reads a live snapshot of the page the user is on and replies
// with sharp, role-specific, data-aware help.
// ============================================================
import { ok, err } from "@/lib/api";
import { runLLM } from "@/lib/llm";
import { ROLE_LABEL, type TeamRole } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PAGE_CONTEXT = 6000;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function isValidMessage(m: unknown): m is ChatMessage {
  if (typeof m !== "object" || m === null) return false;
  const c = m as Record<string, unknown>;
  return (
    (c.role === "user" || c.role === "assistant") &&
    typeof c.content === "string" &&
    c.content.length > 0
  );
}

interface Body {
  messages?: ChatMessage[];
  route?: string;
  pageContext?: string;
  memberRole?: string;
}

function roleLabel(memberRole?: string): string {
  if (memberRole && memberRole in ROLE_LABEL) {
    return ROLE_LABEL[memberRole as TeamRole];
  }
  return "team member";
}

function buildSystem(route: string, memberRole?: string): string {
  return [
    "You are **CAK AI Copilot**, an expert assistant embedded in a multi-agent UGC marketing agency platform.",
    `The user is a ${roleLabel(memberRole)} currently on the **${route}** screen.`,
    "Use the PAGE CONTEXT (a snapshot of what they're looking at) to give sharp, specific, data-aware help: brainstorming, analysis, next actions.",
    "Be concise and practical. Match the user's language (Indonesian/English).",
    "When you analyze, reference concrete items from the page context. Never invent data not present.",
  ].join(" ");
}

function buildPrompt(pageContext: string, messages: ChatMessage[]): string {
  const convo = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
  return `PAGE CONTEXT:\n${pageContext}\n\n---\nCONVERSATION:\n${convo}\nAssistant:`;
}

export async function POST(req: Request) {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return err("invalid JSON body", 400);
    }

    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return err("messages is required and must be non-empty", 400);
    }
    // Guard against malformed / role-injected entries (e.g. a forged "system" turn).
    if (!messages.every(isValidMessage)) {
      return err("messages contains invalid entries", 400);
    }

    const route = (body.route || "unknown").trim() || "unknown";
    const pageContext = (body.pageContext || "(no page content captured)").slice(0, MAX_PAGE_CONTEXT);

    const system = buildSystem(route, body.memberRole);
    const prompt = buildPrompt(pageContext, messages);

    const { text, provider, tokensUsed } = await runLLM({
      system,
      prompt,
      maxTokens: 1200,
      temperature: 0.7,
    });

    return ok({ reply: text, provider, tokensUsed });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Copilot chat failed", 500);
  }
}
