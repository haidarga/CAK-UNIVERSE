// ============================================================
// POST /api/ai-assist — the universal "✨ enhance" endpoint.
// body { tool, input, context?, provider?, model? }
// Every work surface calls this for inline AI help.
// ============================================================
import { ok, err } from "@/lib/api";
import { aiAssist, type AssistTool } from "@/lib/ai-assist";
import type { LLMProvider } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  tool?: AssistTool;
  input?: string;
  context?: string;
  provider?: LLMProvider;
  model?: string;
}

export async function POST(req: Request) {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return err("invalid JSON body", 400);
    }

    if (!body.tool) return err("tool is required", 400);
    if (!body.input || !body.input.trim()) return err("input is required", 400);

    const result = await aiAssist({
      tool: body.tool,
      input: body.input,
      context: body.context,
      provider: body.provider,
      model: body.model,
    });

    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : "AI assist failed", 500);
  }
}
