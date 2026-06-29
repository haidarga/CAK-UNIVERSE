// ============================================================
// GET /api/integrations/google/callback — OAuth redirect target.
// Exchanges the auth code for tokens, fetches the account email, stores
// tokens (service-role), then redirects back to the integrations page.
// ============================================================
import { saveGoogleTokens } from "@/lib/integrations/google/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expires_in?: number;
}

interface GoogleUserInfo {
  email?: string;
}

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const successUrl = `${origin}/integrations?google=connected`;
  const errorUrl = `${origin}/integrations?google=error`;

  try {
    const code = searchParams.get("code");
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!code || !clientId || !clientSecret) {
      return Response.redirect(errorUrl);
    }

    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI || `${origin}/api/integrations/google/callback`;

    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
      cache: "no-store",
    });
    if (!tokenRes.ok) return Response.redirect(errorUrl);
    const tokens = (await tokenRes.json()) as GoogleTokenResponse;
    if (!tokens.access_token) return Response.redirect(errorUrl);

    // Resolve the connected account email (best-effort).
    let email: string | undefined;
    try {
      const infoRes = await fetch(USERINFO_ENDPOINT, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        cache: "no-store",
      });
      if (infoRes.ok) {
        const info = (await infoRes.json()) as GoogleUserInfo;
        email = info.email;
      }
    } catch {
      // email is optional; continue without it
    }

    await saveGoogleTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type,
      expires_in: tokens.expires_in,
      account_email: email,
    });

    return Response.redirect(successUrl);
  } catch {
    return Response.redirect(errorUrl);
  }
}
