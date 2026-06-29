// ============================================================
// ACCOUNT CONNECTION — store each real TikTok/IG account's login
// session ONCE, then reuse it so warmup + scraping act AS that
// account via Lightpanda.
//
// SECURITY: session_cookies / password are sensitive. They live in
// the service-role-only `account_connections` table and must NEVER
// be returned to the browser. This module is SERVER ONLY.
//
// HARD RULE: nothing here throws. Parsing returns [] on garbage;
// DB helpers return null / rethrow only where the caller (API) wraps
// them in try/catch. saveConnection is the one place we surface a
// thrown DB error so the API can report it.
// ============================================================
import { admin, nowIso } from "@/lib/supabase";
import type { AccountConnection, SessionCookie } from "@/lib/types";

type Platform = "tiktok" | "instagram";
type Method = "cookie" | "credentials";

/** Each platform's primary auth cookie + its dotted domain. */
const PLATFORM_META: Record<Platform, { primaryCookie: string; domain: string }> = {
  tiktok: { primaryCookie: "sessionid", domain: ".tiktok.com" },
  instagram: { primaryCookie: "sessionid", domain: ".instagram.com" },
};

/** Shape of an object inside an exported-cookies JSON array. */
interface RawCookieObject {
  name?: unknown;
  value?: unknown;
  domain?: unknown;
  path?: unknown;
  secure?: unknown;
  httpOnly?: unknown;
  expires?: unknown;
  expirationDate?: unknown;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Normalize a single raw cookie object from a browser-export array. */
function normalizeCookieObject(obj: RawCookieObject, platform: Platform): SessionCookie | null {
  const name = asString(obj.name);
  const value = asString(obj.value);
  if (!name || value === undefined) return null;

  const cookie: SessionCookie = {
    name,
    value,
    domain: asString(obj.domain) ?? PLATFORM_META[platform].domain,
    path: asString(obj.path) ?? "/",
  };
  if (typeof obj.secure === "boolean") cookie.secure = obj.secure;
  if (typeof obj.httpOnly === "boolean") cookie.httpOnly = obj.httpOnly;
  const expires = asNumber(obj.expires) ?? asNumber(obj.expirationDate);
  if (expires !== undefined) cookie.expires = expires;
  return cookie;
}

/** Parse a "name=value; name2=value2" cookie header into SessionCookie[]. */
function parseCookieHeader(raw: string, platform: Platform): SessionCookie[] {
  const { domain } = PLATFORM_META[platform];
  return raw
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0 && pair.includes("="))
    .map((pair): SessionCookie | null => {
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!name) return null;
      return { name, value, domain, path: "/" };
    })
    .filter((c): c is SessionCookie => c !== null);
}

/**
 * Accept ANY common cookie input and normalize to SessionCookie[]:
 *   • bare session token (no "=" and no "{")  -> primary cookie
 *   • cookie header string "a=1; b=2"          -> split into cookies
 *   • JSON array from a cookie-export extension -> mapped objects
 * Never throws — returns [] on blank/garbage input.
 */
export function parseCookieInput(raw: string, platform: Platform): SessionCookie[] {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return [];

  // JSON array (cookie-export extension) — try first when it looks like JSON.
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const arr: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
      return arr
        .filter((o): o is RawCookieObject => typeof o === "object" && o !== null)
        .map((o) => normalizeCookieObject(o, platform))
        .filter((c): c is SessionCookie => c !== null);
    } catch {
      return []; // malformed JSON -> graceful empty
    }
  }

  // Cookie header string ("name=value; ...").
  if (trimmed.includes("=")) {
    return parseCookieHeader(trimmed, platform);
  }

  // Bare session token -> the platform's primary cookie.
  const { primaryCookie, domain } = PLATFORM_META[platform];
  return [{ name: primaryCookie, value: trimmed, domain, path: "/" }];
}

/** Row shape as stored (includes the secret column we never expose). */
interface ConnectionRow extends AccountConnection {
  password_enc?: string | null;
}

/** Map a DB row to the client-safe AccountConnection (no password_enc). */
function toConnection(row: ConnectionRow): AccountConnection {
  return {
    id: row.id,
    account_id: row.account_id,
    platform: row.platform,
    auth_method: row.auth_method,
    status: row.status,
    session_cookies: row.session_cookies ?? null,
    username: row.username ?? null,
    label: row.label ?? null,
    last_error: row.last_error ?? null,
    connected_at: row.connected_at ?? null,
    last_verified_at: row.last_verified_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Fetch the stored connection for an account (or null). Never throws. */
export async function getConnection(accountId: string): Promise<AccountConnection | null> {
  try {
    const { data, error } = await admin()
      .from("account_connections")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle();
    if (error || !data) return null;
    return toConnection(data as ConnectionRow);
  } catch {
    return null;
  }
}

interface SaveConnectionArgs {
  accountId: string;
  platform: Platform;
  method: Method;
  cookiesRaw?: string;
  username?: string;
  password?: string;
  label?: string;
}

/**
 * Upsert the connection for an account (unique on account_id).
 * - cookie method: stores parseCookieInput(cookiesRaw).
 * - credentials method: stores username + base64(password) in password_enc.
 *   // TODO: replace base64 with real encryption (KMS/pgcrypto) — base64 is NOT security.
 */
export async function saveConnection(args: SaveConnectionArgs): Promise<AccountConnection> {
  const { accountId, platform, method, cookiesRaw, username, password, label } = args;

  const row: Record<string, unknown> = {
    account_id: accountId,
    platform,
    auth_method: method,
    status: "connected",
    label: label?.trim() || null,
    last_error: null,
    connected_at: nowIso(),
  };

  if (method === "cookie") {
    row.session_cookies = parseCookieInput(cookiesRaw ?? "", platform);
    row.username = null;
    row.password_enc = null;
  } else {
    row.username = username?.trim() || null;
    // TODO: replace base64 with real encryption (KMS/pgcrypto) — base64 is NOT security.
    row.password_enc = password
      ? Buffer.from(password, "utf8").toString("base64")
      : null;
    row.session_cookies = null;
  }

  const { data, error } = await admin()
    .from("account_connections")
    .upsert(row, { onConflict: "account_id" })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "failed to save connection");
  }
  return toConnection(data as ConnectionRow);
}

/** Return the stored cookies for an account (or null). Never throws. */
export async function loadSessionCookies(accountId: string): Promise<SessionCookie[] | null> {
  const conn = await getConnection(accountId);
  if (!conn || !conn.session_cookies || conn.session_cookies.length === 0) return null;
  return conn.session_cookies;
}

/** Mark a connection disconnected (and clear its secrets). Never throws. */
export async function disconnect(accountId: string): Promise<void> {
  try {
    await admin()
      .from("account_connections")
      .update({
        status: "disconnected",
        session_cookies: null,
        password_enc: null,
        updated_at: nowIso(),
      })
      .eq("account_id", accountId);
  } catch {
    // graceful — disconnect must never throw.
  }
}
