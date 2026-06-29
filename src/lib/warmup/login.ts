// ============================================================
// Auto-login & session capture — the "just connect & login" path.
// Drives Lightpanda to the platform login page, submits credentials,
// then captures the resulting session cookies and stores them via
// saveConnection (cookie method). After this the account is connected
// and warmup/scraping act AS it.
//
// REALITY: TikTok/IG have no public OAuth for engagement automation, and
// login is bot-protected. This best-effort flow works when there's no
// captcha/2FA challenge; otherwise fall back to pasting a session cookie.
// NEVER throws — returns a structured result.
// ============================================================
import { withLightpanda } from "@/lib/integrations/browser";
import { saveConnection } from "./connection";

type Platform = "tiktok" | "instagram";

const LOGIN_URL: Record<Platform, string> = {
  tiktok: "https://www.tiktok.com/login/phone-or-email/email",
  instagram: "https://www.instagram.com/accounts/login/",
};

// Cookies that prove an authenticated session.
const SESSION_RE = /sessionid|sid_tt|sessionid_ss|sid_guard/i;

export interface LoginResult {
  ok: boolean;
  cookieCount: number;
  error?: string;
}

export async function loginAndCapture(args: {
  accountId: string;
  platform: Platform;
  username: string;
  password: string;
  label?: string;
}): Promise<LoginResult> {
  if (!process.env.LIGHTPANDA_CDP_URL) {
    return {
      ok: false,
      cookieCount: 0,
      error: "Lightpanda not connected (LIGHTPANDA_CDP_URL unset). Use the cookie-paste method instead.",
    };
  }

  try {
    return await withLightpanda(async (page) => {
      await page.goto(LOGIN_URL[args.platform], { waitUntil: "domcontentloaded", timeout: 30_000 });

      // Best-effort form fill — selectors differ per platform and change often.
      try {
        if (args.platform === "instagram") {
          await page.type('input[name="username"]', args.username, { delay: 60 });
          await page.type('input[name="password"]', args.password, { delay: 60 });
          await page.click('button[type="submit"]');
        } else {
          await page.type('input[name="username"], input[type="text"]', args.username, { delay: 60 });
          await page.type('input[type="password"]', args.password, { delay: 60 });
          await page.click('[data-e2e="login-button"], button[type="submit"]');
        }
      } catch {
        // Selector drift — fall through and still check for a session cookie.
      }

      // Give the login + redirects time to settle.
      await new Promise((r) => setTimeout(r, 9_000));

      const cookies = await page.cookies();
      const session = cookies.filter((c) => SESSION_RE.test(c.name) && !!c.value);
      if (session.length === 0) {
        return {
          ok: false,
          cookieCount: 0,
          error:
            "Login did not produce a session (likely captcha / 2FA / checkpoint). Use the cookie-paste method.",
        };
      }

      // Persist the full cookie jar (JSON → parseCookieInput handles arrays).
      await saveConnection({
        accountId: args.accountId,
        platform: args.platform,
        method: "cookie",
        cookiesRaw: JSON.stringify(cookies),
        username: args.username,
        label: args.label,
      });

      return { ok: true, cookieCount: session.length };
    });
  } catch (e) {
    return { ok: false, cookieCount: 0, error: e instanceof Error ? e.message : "login failed" };
  }
}
