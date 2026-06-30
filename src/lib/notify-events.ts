// ============================================================
// Pipeline event notifications — Telegram alert + activity log.
//
// One helper the agents call when something noteworthy happens (a script is
// written, a guardrail trips, QC passes/fails). Fire-and-forget: both the
// Telegram send and the activity write swallow their own errors, so a
// notification failure NEVER breaks an agent run. No-ops on Telegram when
// TELEGRAM_BOT_TOKEN / TELEGRAM_ALERT_CHAT_ID are unset.
// ============================================================
import { sendTelegramAlert } from "@/lib/integrations/telegram";
import { logActivity } from "@/lib/activity";

const EMOJI: Record<string, string> = { info: "ℹ️", success: "✅", warn: "⚠️" };

export interface PipelineEvent {
  event: string; // human-readable label, e.g. "Naskah siap (Jebret)"
  level?: "info" | "success" | "warn";
  brandName?: string | null;
  brandId?: string | null;
  title?: string | null; // content title
  detail?: string | null; // extra context (violations, scores, …)
  pipelineId?: string | null;
}

/** Send a Telegram alert + write an activity row for a pipeline event. */
export async function notifyPipelineEvent(e: PipelineEvent): Promise<void> {
  const emoji = EMOJI[e.level ?? "info"] ?? "ℹ️";
  const message = [
    `${emoji} *${e.event}*`,
    e.brandName ? `Brand: ${e.brandName}` : "",
    e.title ? `Konten: ${e.title}` : "",
    e.detail ? e.detail : "",
  ]
    .filter(Boolean)
    .join("\n");

  await sendTelegramAlert(message);
  await logActivity({
    entityType: "pipeline",
    entityId: e.pipelineId ?? null,
    action: e.event,
    summary: e.title ?? undefined,
    brandId: e.brandId ?? null,
  });
}
