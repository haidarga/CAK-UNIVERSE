// ============================================================
// Telegram alerting — fire-and-forget. Never throws.
// No-ops silently if TELEGRAM_BOT_TOKEN / TELEGRAM_ALERT_CHAT_ID
// are missing. Used by AccountMonitorAgent for high/critical alerts.
// ============================================================

/**
 * POST a message to the Telegram Bot API.
 * Swallows all errors so an alert failure never breaks an agent run.
 */
export async function sendTelegramAlert(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID;

  if (!token || !chatId) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_ALERT_CHAT_ID not set — skipping alert");
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.warn(`[telegram] sendMessage failed: ${res.status} ${res.statusText}`);
    }
  } catch (e) {
    console.warn(`[telegram] sendMessage error: ${e instanceof Error ? e.message : String(e)}`);
  }
}
