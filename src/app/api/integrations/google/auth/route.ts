// ============================================================
// GET /api/integrations/google/auth — start the OAuth consent flow.
// Redirects the browser to Google's consent screen.
// ============================================================
import { err } from "@/lib/api";
import { googleAuthUrl } from "@/lib/integrations/google/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return err("Google not configured: set GOOGLE_CLIENT_ID/SECRET", 400);
    }
    const { searchParams, origin } = new URL(req.url);
    const state = searchParams.get("state") ?? undefined;
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI || `${origin}/api/integrations/google/callback`;
    return Response.redirect(googleAuthUrl(redirectUri, state));
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to start Google OAuth", 500);
  }
}
