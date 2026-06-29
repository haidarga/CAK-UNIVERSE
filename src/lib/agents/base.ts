// ============================================================
// BaseAgent — shared LLM call + auto-logging to agent_logs.
// Every agent extends this. Provider (Claude/Gemini) is pluggable.
// ============================================================
import { admin } from "@/lib/supabase";
import { runLLM, extractJson, type LLMProvider } from "@/lib/llm";

export interface AgentRunContext {
  brandId?: string | null;
  accountId?: string | null;
  pipelineId?: string | null;
  runType?: "scheduled" | "triggered" | "manual";
}

export interface AgentRunOptions extends AgentRunContext {
  system: string;
  prompt: string;
  json?: boolean;
  provider?: LLMProvider;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AgentResult<T = string> {
  success: boolean;
  data?: T;
  raw?: string;
  tokensUsed?: number;
  error?: string;
}

export abstract class BaseAgent {
  constructor(public readonly agentName: string) {}

  /** Run the LLM, auto-log, and optionally parse JSON. */
  protected async run<T = string>(opts: AgentRunOptions): Promise<AgentResult<T>> {
    const startedAt = Date.now();
    try {
      const res = await runLLM({
        system: opts.system,
        prompt: opts.prompt,
        json: opts.json,
        provider: opts.provider,
        model: opts.model,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
      });

      const data = (opts.json ? extractJson<T>(res.text) : (res.text as unknown as T));

      await this.log({
        ...opts,
        inputSummary: opts.prompt.slice(0, 300),
        outputSummary: res.text.slice(0, 300),
        tokensUsed: res.tokensUsed,
        durationMs: Date.now() - startedAt,
        status: "success",
      });

      return { success: true, data, raw: res.text, tokensUsed: res.tokensUsed };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.log({
        ...opts,
        inputSummary: opts.prompt.slice(0, 300),
        durationMs: Date.now() - startedAt,
        status: "failed",
        errorMessage: message,
      });
      return { success: false, error: message };
    }
  }

  private async log(args: {
    brandId?: string | null;
    accountId?: string | null;
    pipelineId?: string | null;
    runType?: string;
    inputSummary?: string;
    outputSummary?: string;
    tokensUsed?: number;
    durationMs?: number;
    status: string;
    errorMessage?: string;
  }): Promise<void> {
    try {
      await admin()
        .from("agent_logs")
        .insert({
          agent_name: this.agentName,
          run_type: args.runType ?? "triggered",
          brand_id: args.brandId ?? null,
          account_id: args.accountId ?? null,
          pipeline_id: args.pipelineId ?? null,
          input_summary: args.inputSummary ?? null,
          output_summary: args.outputSummary ?? null,
          tokens_used: args.tokensUsed ?? null,
          duration_ms: args.durationMs ?? null,
          status: args.status,
          error_message: args.errorMessage ?? null,
        });
    } catch {
      // Logging must never break an agent run.
    }
  }

  // ---- Shared CIH reads ----
  protected async getBrand(brandId: string) {
    const { data } = await admin().from("brands").select("*").eq("id", brandId).single();
    return data;
  }

  protected async getAccounts(brandId: string, phase?: string) {
    let q = admin().from("accounts").select("*").eq("brand_id", brandId).eq("status", "active");
    if (phase) q = q.eq("warmup_phase", phase);
    const { data } = await q;
    return data ?? [];
  }
}
