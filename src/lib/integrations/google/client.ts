// ============================================================
// Google OAuth client — token storage, refresh, and consent URL.
// SECURITY: access/refresh tokens live in `oauth_tokens` (service-role only)
// and are NEVER returned to the browser. Callers expose connection status only.
// ============================================================
import { admin, nowIso } from "@/lib/supabase";

const PROVIDER = "google";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

// Refresh a little early so an in-flight request never races expiry.
const EXPIRY_SKEW_MS = 60_000;

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
].join(" ");

interface OAuthTokenRow {
  id: string;
  provider: string;
  account_email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  scope: string | null;
  token_type: string | null;
  expires_at: string | null;
  connected_by: string | null;
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expires_in?: number;
}

/** Load the single google oauth_tokens row, if any. Never throws. */
async function loadGoogleRow(): Promise<OAuthTokenRow | null> {
  try {
    const { data, error } = await admin()
      .from("oauth_tokens")
      .select("*")
      .eq("provider", PROVIDER)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return (data as OAuthTokenRow | null) ?? null;
  } catch {
    return null;
  }
}

/** Whether Google is connected, plus the connected account email. */
export async function googleConnected(): Promise<{ connected: boolean; email?: string }> {
  const row = await loadGoogleRow();
  if (!row) return { connected: false };
  return { connected: true, email: row.account_email ?? undefined };
}

/** Compute expiry ISO from an expires_in (seconds), defaulting to 1h. */
function expiresAtFrom(expiresInSec?: number): string {
  const seconds = typeof expiresInSec === "number" && expiresInSec > 0 ? expiresInSec : 3600;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/**
 * Upsert Google tokens on (provider, account_email).
 * Keeps the existing refresh_token when a new one isn't returned (Google omits
 * it on subsequent consents).
 */
export async function saveGoogleTokens(t: {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expires_in?: number;
  account_email?: string;
  connectedBy?: string;
}): Promise<void> {
  const db = admin();
  const accountEmail = t.account_email ?? null;

  // Preserve an existing refresh_token if Google didn't send a new one.
  let refreshToken = t.refresh_token ?? null;
  if (!refreshToken) {
    const { data: existing } = await db
      .from("oauth_tokens")
      .select("refresh_token")
      .eq("provider", PROVIDER)
      .eq("account_email", accountEmail)
      .maybeSingle();
    refreshToken = (existing as { refresh_token: string | null } | null)?.refresh_token ?? null;
  }

  const row = {
    provider: PROVIDER,
    account_email: accountEmail,
    access_token: t.access_token,
    refresh_token: refreshToken,
    scope: t.scope ?? null,
    token_type: t.token_type ?? "Bearer",
    expires_at: expiresAtFrom(t.expires_in),
    connected_by: t.connectedBy ?? null,
    updated_at: nowIso(),
  };

  await db.from("oauth_tokens").upsert(row, { onConflict: "provider,account_email" });
}

/** Persist a refreshed access token + expiry on an existing row by id. */
async function persistRefreshedToken(
  id: string,
  accessToken: string,
  expiresInSec?: number,
): Promise<void> {
  await admin()
    .from("oauth_tokens")
    .update({
      access_token: accessToken,
      expires_at: expiresAtFrom(expiresInSec),
      updated_at: nowIso(),
    })
    .eq("id", id);
}

/** Exchange a refresh_token for a fresh access token. Returns null on failure. */
async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as GoogleTokenResponse;
  } catch {
    return null;
  }
}

/**
 * Return a valid Google access token, refreshing if expired/near-expiry.
 * Returns null if not connected or refresh fails. Never throws.
 */
export async function getGoogleAccessToken(): Promise<string | null> {
  const row = await loadGoogleRow();
  if (!row) return null;

  const expiresAtMs = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  const isFresh =
    !!row.access_token && Number.isFinite(expiresAtMs) && expiresAtMs - EXPIRY_SKEW_MS > Date.now();
  if (isFresh) return row.access_token;

  if (!row.refresh_token) return row.access_token ?? null;

  const refreshed = await refreshAccessToken(row.refresh_token);
  if (!refreshed?.access_token) return null;

  await persistRefreshedToken(row.id, refreshed.access_token, refreshed.expires_in);
  return refreshed.access_token;
}

/** Remove all google oauth_tokens rows (disconnect). Never throws. */
export async function disconnectGoogle(): Promise<void> {
  try {
    await admin().from("oauth_tokens").delete().eq("provider", PROVIDER);
  } catch {
    // best-effort; nothing to surface to the client
  }
}

/** Build the Google OAuth consent URL (offline access, forced consent). */
export function googleAuthUrl(redirectUri: string, state?: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_SCOPES,
  });
  if (state) params.set("state", state);
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}
