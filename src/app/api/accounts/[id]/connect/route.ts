// ============================================================
// /api/accounts/[id]/connect — connect / inspect / disconnect a real
// account's login session so warmup + scraping act AS it via Lightpanda.
//
// SECURITY: GET/POST return only a SAFE view. session_cookies and
// password are NEVER serialized to the client.
// ============================================================
import { saveConnection, getConnection, disconnect } from "@/lib/warmup/connection";
import { loginAndCapture } from "@/lib/warmup/login";
import { ok, err } from "@/lib/api";
import type { AccountConnection } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Platform = "tiktok" | "instagram";
type Method = "cookie" | "credentials";

interface ConnectBody {
  platform?: string;
  method?: string;
  cookiesRaw?: string;
  username?: string;
  password?: string;
  label?: string;
}

/** Client-facing connection view — contains NO secrets. */
interface SafeConnection {
  connected: boolean;
  status: AccountConnection["status"];
  platform: AccountConnection["platform"];
  auth_method: AccountConnection["auth_method"];
  username: string | null;
  label: string | null;
  connected_at: string | null;
  cookieCount: number;
}

/** Build the safe view from a stored connection. Never includes cookies/password. */
function toSafe(conn: AccountConnection): SafeConnection {
  return {
    connected: conn.status === "connected",
    status: conn.status,
    platform: conn.platform,
    auth_method: conn.auth_method,
    username: conn.username,
    label: conn.label,
    connected_at: conn.connected_at,
    cookieCount: conn.session_cookies?.length ?? 0,
  };
}

const PLATFORMS: readonly Platform[] = ["tiktok", "instagram"];
const METHODS: readonly Method[] = ["cookie", "credentials"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return err("account id is required", 400);

    let body: ConnectBody;
    try {
      body = (await req.json()) as ConnectBody;
    } catch {
      return err("invalid JSON body", 400);
    }

    const platform = body.platform;
    if (!platform || !PLATFORMS.includes(platform as Platform)) {
      return err(`invalid platform; must be one of: ${PLATFORMS.join(", ")}`, 400);
    }
    const method = body.method ?? "cookie";
    if (!METHODS.includes(method as Method)) {
      return err(`invalid method; must be one of: ${METHODS.join(", ")}`, 400);
    }

    if (method === "cookie" && !body.cookiesRaw?.trim()) {
      return err("cookiesRaw is required for the cookie method", 400);
    }
    if (method === "credentials" && (!body.username?.trim() || !body.password)) {
      return err("username and password are required for the credentials method", 400);
    }

    // Credentials method WITH Lightpanda connected → drive a real login and
    // capture the session automatically ("just connect & login").
    if (method === "credentials" && process.env.LIGHTPANDA_CDP_URL) {
      const res = await loginAndCapture({
        accountId: id,
        platform: platform as Platform,
        username: body.username as string,
        password: body.password as string,
        label: body.label,
      });
      if (!res.ok) return err(res.error ?? "auto-login failed", 502);
      const fresh = await getConnection(id);
      return ok(fresh ? toSafe(fresh) : { connected: true });
    }

    const conn = await saveConnection({
      accountId: id,
      platform: platform as Platform,
      method: method as Method,
      cookiesRaw: body.cookiesRaw,
      username: body.username,
      password: body.password,
      label: body.label,
    });

    return ok(toSafe(conn));
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to connect account", 500);
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return err("account id is required", 400);

    const conn = await getConnection(id);
    if (!conn) return ok({ connected: false });
    return ok(toSafe(conn));
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to load connection", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return err("account id is required", 400);

    await disconnect(id);
    return ok({ connected: false });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to disconnect account", 500);
  }
}
