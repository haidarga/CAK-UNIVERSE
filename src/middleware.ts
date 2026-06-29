// ============================================================
// Auth middleware. Refreshes the Supabase session on every request
// and protects all app routes EXCEPT public ones (/login, cron
// routes which use bearer auth, static assets).
//
// IMPORTANT: in production NEXT_PUBLIC_SUPABASE_URL and
// NEXT_PUBLIC_SUPABASE_ANON_KEY MUST be set. When they are absent
// (e.g. local dev without auth wired up) we deliberately do NOT
// hard-crash — we log a warning and let the request through so the
// app still renders. Do not rely on this fallback in production.
// ============================================================
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/** Path prefixes that never require a session. */
const PUBLIC_PREFIXES = ["/login", "/api/cron", "/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Degrade gracefully if auth is not configured (local dev only).
  if (!url || !key) {
    console.warn(
      "[middleware] Supabase env not set — auth disabled. " +
        "Set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY in production.",
    );
    return NextResponse.next();
  }

  // Build a response we can attach refreshed session cookies to.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh the session (writes rotated cookies onto `response`).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public paths render regardless of auth.
  if (isPublicPath(pathname)) {
    return response;
  }

  // No session on a protected path → redirect to login with return path.
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // Run on everything except Next internals, static assets, and the
  // favicon. The handler itself further exempts /login + /api/cron.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf|map)$).*)",
  ],
};
