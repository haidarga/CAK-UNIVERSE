// ============================================================
// Warmup SESSION EXECUTOR — turns a WarmupPlan into real, logged,
// human-paced account activity.
//
// Two modes, chosen at runtime by LIGHTPANDA_CDP_URL:
//   • SIMULATION (no CDP url): proves the whole pipeline without a
//     browser. Iterates the plan, generates REAL AI comments via
//     aiAssist, logs every action — but skips the long human sleeps.
//   • REAL (CDP url set): drives a Lightpanda page over CDP, awaiting
//     every delay/watch so timing looks human. Each action is wrapped
//     in try/catch and logged failed-but-continue.
//
// HARD RULE: runWarmupSession NEVER throws. Any failure is caught and
// recorded on the warmup_runs row (status "failed").
// ============================================================
import type { Page } from "puppeteer-core";
import { admin, nowIso } from "@/lib/supabase";
import { logActivity } from "@/lib/activity";
import { aiAssist } from "@/lib/ai-assist";
import { withLightpanda } from "@/lib/integrations/browser";
import { loadSessionCookies } from "./connection";
import { planWarmupSession, type WarmupAction, type WarmupPlan } from "./planner";
import type { Account, WarmupRun } from "@/lib/types";

/** Max ms we ever actually sleep in SIMULATION mode (keeps it instant-ish). */
const SIM_SLEEP_CAP_MS = 15;

/** Placeholder captions used to seed AI comments when no real caption is scraped. */
const SAMPLE_CAPTIONS = [
  "POV: kamu nemu hidden gem kafe di pinggir kota",
  "Tutorial makeup natural buat ke kampus, 5 menit kelar",
  "Resep ayam geprek sambal matah yang viral banget",
  "Daily vlog: morning routine anak rantau di Jakarta",
  "Review jujur skincare lokal yang lagi hype",
  "Tips hemat anak kos biar bisa nabung tiap bulan",
];

/** Sleep helper. In simulation mode every wait is capped so the run is fast. */
function sleep(ms: number, simulate: boolean): Promise<void> {
  const real = simulate ? Math.min(ms, SIM_SLEEP_CAP_MS) : ms;
  if (real <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, real));
}

/** Pick a deterministic-ish sample caption for an action step. */
function sampleCaption(step: number): string {
  return SAMPLE_CAPTIONS[Math.abs(step) % SAMPLE_CAPTIONS.length];
}

/** The shape returned to callers — the persisted run row (or an error stand-in). */
export interface WarmupSessionResult {
  ok: boolean;
  run: WarmupRun | null;
  error?: string;
}

/** Build the feed URL for the account's platform. */
function feedUrl(platform: Account["platform"]): string {
  return platform === "instagram" ? "https://www.instagram.com/" : "https://www.tiktok.com/foryou";
}

/** Insert a warmup_actions row. Best-effort — swallows its own errors. */
async function logAction(
  runId: string,
  accountId: string,
  action: WarmupAction,
  status: "done" | "failed" | "skipped",
  commentText: string | null,
  targetUrl: string | null,
): Promise<void> {
  try {
    await admin()
      .from("warmup_actions")
      .insert({
        run_id: runId,
        account_id: accountId,
        type: action.type,
        target_url: targetUrl,
        comment_text: commentText,
        watch_ms: action.watchMs ?? null,
        delay_ms: action.delayMs ?? null,
        status,
      });
  } catch {
    // best-effort logging — never break the session for a log write.
  }
}

/** Generate a real, non-template AI comment for a video caption. */
async function generateComment(caption: string, account: Account): Promise<string> {
  const res = await aiAssist({
    tool: "warmup_comment",
    input: caption,
    context: `Platform: ${account.platform}. You are the account @${account.username} casually browsing the feed.`,
  });
  return (res.text ?? "").trim();
}

// ------------------------------------------------------------
// SIMULATION MODE — no browser. Generates real comments, logs all.
// ------------------------------------------------------------
async function runSimulated(
  runId: string,
  account: Account,
  plan: WarmupPlan,
): Promise<number> {
  let done = 0;
  for (const action of plan.actions) {
    try {
      // Capped wait — proves ordering without burning real human delays.
      await sleep(action.delayMs, true);
      if (action.watchMs) await sleep(action.watchMs, true);

      if (action.type === "comment") {
        const caption = sampleCaption(action.step);
        const text = await generateComment(caption, account);
        await logAction(runId, account.id, action, "done", text, null);
      } else {
        await logAction(runId, account.id, action, "done", null, null);
      }
      done += 1;
    } catch {
      await logAction(runId, account.id, action, "failed", null, null);
    }
  }
  return done;
}

// ------------------------------------------------------------
// REAL MODE — drives a Lightpanda page over CDP with human timing.
//
// LOGIN (wired): a warmup account must be AUTHENTICATED before it browses.
// runReal now restores the account's stored session cookies via
// page.setCookie(...) BEFORE navigating, so the page loads logged-in AS
// that account. Cookies come from the service-role `account_connections`
// table (loadSessionCookies, keyed by account.id) — never hardcoded.
// If no cookies are stored the session runs UNAUTHENTICATED (logged note);
// connect the account first via /api/accounts/[id]/connect.
// NOTE: credentials-method auto-login (username/password) is not driven
// here yet — session cookies are the reliable path and are preferred.
// ------------------------------------------------------------
async function performAction(page: Page, action: WarmupAction, account: Account): Promise<string | null> {
  switch (action.type) {
    case "scroll":
      // Advance the feed: scroll down a viewport (works for both feeds).
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      return null;
    case "watch":
      // Dwell on the current video for a human amount of time.
      if (action.watchMs) await sleep(action.watchMs, false);
      return null;
    case "like": {
      // TikTok exposes data-e2e="like-icon"; IG uses an aria-labeled svg.
      const sel = account.platform === "instagram" ? 'svg[aria-label="Like"]' : '[data-e2e="like-icon"]';
      await page.evaluate((s) => {
        const el = document.querySelector<HTMLElement>(s);
        el?.click();
      }, sel);
      return null;
    }
    case "comment": {
      // Read the visible caption if scrapeable, else fall back to a sample.
      const caption = await page.evaluate(() => {
        const el =
          document.querySelector('[data-e2e="browse-video-desc"]') ??
          document.querySelector('[data-e2e="video-desc"]') ??
          document.querySelector("article h1, article span");
        return el ? (el.textContent ?? "").trim() : "";
      });
      const seed = caption || sampleCaption(action.step);
      const text = await generateComment(seed, account);
      // Type + submit into the comment box (selectors are best-effort).
      await page.evaluate((value) => {
        const box = document.querySelector<HTMLElement>(
          '[data-e2e="comment-input"], textarea[aria-label*="omment"], div[contenteditable="true"]',
        );
        if (box) {
          (box as HTMLInputElement).value = value;
          box.textContent = value;
          box.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, text);
      return text;
    }
    case "follow": {
      const sel = account.platform === "instagram"
        ? 'button:has-text("Follow")'
        : '[data-e2e="follow-button"]';
      await page.evaluate((s) => {
        const el = document.querySelector<HTMLElement>(s);
        el?.click();
      }, sel);
      return null;
    }
    default:
      return null;
  }
}

async function runReal(runId: string, account: Account, plan: WarmupPlan): Promise<number> {
  return withLightpanda(async (page) => {
    let done = 0;
    const url = feedUrl(account.platform);

    // Authenticate AS the account: restore stored session cookies BEFORE
    // navigating so the feed loads logged-in. Best-effort — a missing or
    // failed session must never abort the run, it just browses unauthenticated.
    try {
      const cookies = await loadSessionCookies(account.id);
      if (cookies && cookies.length > 0) {
        await page.setCookie(...cookies);
      } else {
        console.warn(
          `[warmup] account ${account.id} (@${account.username}) has no stored session — ` +
            "browsing UNAUTHENTICATED. Connect it via /api/accounts/[id]/connect.",
        );
      }
    } catch (e) {
      console.warn(
        `[warmup] failed to inject session cookies for account ${account.id}:`,
        e instanceof Error ? e.message : e,
      );
    }

    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
    } catch {
      // Navigation failure: log nothing extra, the loop will simply fail actions.
    }

    for (const action of plan.actions) {
      try {
        // Human pause BEFORE acting.
        await sleep(action.delayMs, false);
        const comment = await performAction(page, action, account);
        await logAction(runId, account.id, action, "done", comment, url);
        done += 1;
      } catch {
        // One bad action must never abort the session.
        await logAction(runId, account.id, action, "failed", null, url);
      }
    }
    return done;
  });
}

// ------------------------------------------------------------
// PUBLIC ENTRYPOINT
// ------------------------------------------------------------
export async function runWarmupSession(
  accountId: string,
  opts?: { targetMinutes?: number },
): Promise<WarmupSessionResult> {
  const db = admin();

  // 1) Load the account.
  let account: Account | null = null;
  try {
    const { data, error } = await db.from("accounts").select("*").eq("id", accountId).single();
    if (error || !data) {
      return { ok: false, run: null, error: error?.message ?? "account not found" };
    }
    account = data as Account;
  } catch (e) {
    return { ok: false, run: null, error: e instanceof Error ? e.message : "failed to load account" };
  }

  // 2) Skip cases — enabled flag off or paused phase.
  const enabled = (account as Account & { warmup_enabled?: boolean }).warmup_enabled;
  if (enabled === false || account.warmup_phase === "paused") {
    const note =
      enabled === false ? "skipped (warmup disabled)" : "skipped (phase paused)";
    try {
      const { data } = await db
        .from("warmup_runs")
        .insert({
          account_id: accountId,
          phase: account.warmup_phase,
          status: "skipped",
          note,
          started_at: nowIso(),
          finished_at: nowIso(),
        })
        .select("*")
        .single();
      return { ok: true, run: (data ?? null) as WarmupRun | null };
    } catch (e) {
      return { ok: false, run: null, error: e instanceof Error ? e.message : "skip insert failed" };
    }
  }

  // 3) Plan the session (optionally fit a target duration in minutes).
  const plan = planWarmupSession(account.warmup_phase, Math.random, opts?.targetMinutes);
  const simulate = !process.env.LIGHTPANDA_CDP_URL;

  // 4) Insert the running row.
  let runId: string;
  try {
    const { data, error } = await db
      .from("warmup_runs")
      .insert({
        account_id: accountId,
        phase: plan.phase,
        status: "running",
        videos: plan.videos,
        likes: plan.likes,
        comments: plan.comments,
        follows: plan.follows,
        actions_planned: plan.actions.length,
        actions_done: 0,
        started_at: nowIso(),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "failed to create warmup run");
    runId = (data as { id: string }).id;
  } catch (e) {
    return { ok: false, run: null, error: e instanceof Error ? e.message : "run insert failed" };
  }

  // 5) Execute — every failure is contained.
  try {
    const actionsDone = simulate
      ? await runSimulated(runId, account, plan)
      : await runReal(runId, account, plan);

    const note = simulate ? "simulated (Lightpanda not connected)" : "live (Lightpanda)";

    const { data } = await db
      .from("warmup_runs")
      .update({
        status: "completed",
        actions_done: actionsDone,
        note,
        finished_at: nowIso(),
      })
      .eq("id", runId)
      .select("*")
      .single();

    // Stamp the account + write the activity feed (both best-effort).
    await db.from("accounts").update({ last_warmup_at: nowIso() }).eq("id", accountId);
    await logActivity({
      actorId: null,
      entityType: "account",
      entityId: accountId,
      action: "warmup",
      summary: `Warmup session: ${plan.likes} likes, ${plan.comments} comments`,
      brandId: account.brand_id,
    });

    return { ok: true, run: (data ?? null) as WarmupRun | null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "warmup execution failed";
    try {
      const { data } = await db
        .from("warmup_runs")
        .update({ status: "failed", error: message, finished_at: nowIso() })
        .eq("id", runId)
        .select("*")
        .single();
      return { ok: false, run: (data ?? null) as WarmupRun | null, error: message };
    } catch {
      return { ok: false, run: null, error: message };
    }
  }
}
