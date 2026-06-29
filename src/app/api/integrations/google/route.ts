// ============================================================
// /api/integrations/google — connection status + disconnect.
// GET    → { connected, email? }   (status only, never tokens)
// DELETE → removes stored tokens, returns { connected: false }
// ============================================================
import { ok, err } from "@/lib/api";
import { googleConnected, disconnectGoogle } from "@/lib/integrations/google/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return ok(await googleConnected());
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to read Google status", 500);
  }
}

export async function DELETE() {
  try {
    await disconnectGoogle();
    return ok({ connected: false });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to disconnect Google", 500);
  }
}
