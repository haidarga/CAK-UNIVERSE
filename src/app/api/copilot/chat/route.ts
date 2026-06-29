// ============================================================
// POST /api/copilot/chat — page-aware AI Copilot conversation.
// body { messages, route?, pageContext?, memberRole?, memberId?, threadId? }
// Reads a live snapshot of the page the user is on and replies
// with sharp, role-specific, data-aware help. When a memberId is
// supplied, the turn is persisted to copilot_threads/_messages so
// chatrooms survive reloads. Persistence is best-effort: a DB hiccup
// must never break the reply.
// ============================================================
import { ok, err } from "@/lib/api";
import { runLLM } from "@/lib/llm";
import { admin, nowIso } from "@/lib/supabase";
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
  memberId?: string;
  threadId?: string;
}

const TITLE_MAX = 60;

/** Latest user message in the wire history, if the last item is one. */
function latestUserMessage(messages: ChatMessage[]): string | null {
  const last = messages[messages.length - 1];
  return last && last.role === "user" ? last.content : null;
}

/**
 * Resolve the thread for this turn: reuse threadId when given, else create a
 * fresh thread titled from the latest user message. Returns null on any failure.
 */
async function resolveThread(
  memberId: string,
  threadId: string | undefined,
  route: string,
  firstUserMessage: string | null,
): Promise<string | null> {
  const db = admin();
  if (threadId) return threadId;
  const title = (firstUserMessage ?? "New chat").slice(0, TITLE_MAX).trim() || "New chat";
  const { data, error } = await db
    .from("copilot_threads")
    .insert({ member_id: memberId, route, title, last_message_at: nowIso() })
    .select("id")
    .single();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

/** Insert the latest user message unless it duplicates the most recent stored row. */
async function saveUserMessage(
  threadId: string,
  memberId: string,
  content: string,
): Promise<void> {
  const db = admin();
  const { data } = await db
    .from("copilot_messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1);
  const latest = data?.[0] as { role: string; content: string } | undefined;
  if (latest && latest.role === "user" && latest.content === content) return;
  await db
    .from("copilot_messages")
    .insert({ thread_id: threadId, member_id: memberId, role: "user", content });
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

    const memberId = body.memberId?.trim() || undefined;
    const userMessage = latestUserMessage(messages);

    // --- Persist: resolve thread + save user turn BEFORE the LLM call.
    // Best-effort: any failure leaves threadId null and never blocks the reply.
    let threadId: string | null = null;
    if (memberId) {
      try {
        threadId = await resolveThread(memberId, body.threadId?.trim() || undefined, route, userMessage);
        if (threadId && userMessage) await saveUserMessage(threadId, memberId, userMessage);
      } catch {
        threadId = body.threadId?.trim() || null;
      }
    }

    const { text, provider, tokensUsed } = await runLLM({
      system,
      prompt,
      // Gemini 2.5 spends part of the output budget on internal "thinking",
      // so keep this generous or replies get cut off mid-answer.
      maxTokens: 4096,
      temperature: 0.7,
    });

    // --- Persist: save assistant reply + bump thread timestamp.
    if (memberId && threadId) {
      try {
        const db = admin();
        await db
          .from("copilot_messages")
          .insert({ thread_id: threadId, member_id: memberId, role: "assistant", content: text });
        await db
          .from("copilot_threads")
          .update({ last_message_at: nowIso() })
          .eq("id", threadId);
      } catch {
        /* best-effort persistence — reply already produced */
      }
    }

    return ok({ reply: text, provider, tokensUsed, threadId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Copilot chat failed", 500);
  }
}
