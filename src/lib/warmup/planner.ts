// ============================================================
// Warmup action PLANNER — pure, deterministic-with-injected-RNG.
// Produces a human-like session: scroll → watch → (maybe) like →
// (maybe) comment → (maybe) follow, with jittered delays so it
// never looks like a bot. Intensity scales with warmup phase.
// No browser, no network, no LLM here — fully unit-tested.
// ============================================================
import type { WarmupPhase } from "@/lib/constants";

export type WarmupActionType = "watch" | "like" | "comment" | "follow" | "scroll";

export interface WarmupAction {
  /** order in the session */
  step: number;
  type: WarmupActionType;
  /** how long to dwell / wait BEFORE doing the next thing (ms) */
  delayMs: number;
  /** for "watch": how many ms to watch the video */
  watchMs?: number;
  /** true when this video should also get an AI comment */
  needsComment?: boolean;
}

export interface WarmupPlan {
  phase: WarmupPhase;
  videos: number;
  actions: WarmupAction[];
  likes: number;
  comments: number;
  follows: number;
  estimatedDurationMs: number;
}

/** Per-phase behaviour envelope. Gentle when cold, assertive when active. */
interface PhaseProfile {
  videos: [number, number]; // feed items to consume
  watchMs: [number, number]; // dwell per video
  likeRate: number; // p(like) per video
  commentRate: number; // p(comment) per video
  followRate: number; // p(follow) per video
  gapMs: [number, number]; // human pause between videos
}

const PROFILES: Record<WarmupPhase, PhaseProfile> = {
  cold: { videos: [8, 12], watchMs: [3000, 9000], likeRate: 0.15, commentRate: 0, followRate: 0, gapMs: [1200, 4000] },
  warming: { videos: [12, 18], watchMs: [4000, 12000], likeRate: 0.25, commentRate: 0.06, followRate: 0.04, gapMs: [1000, 3500] },
  warm: { videos: [18, 25], watchMs: [4000, 15000], likeRate: 0.35, commentRate: 0.12, followRate: 0.08, gapMs: [900, 3200] },
  active: { videos: [25, 40], watchMs: [3000, 18000], likeRate: 0.45, commentRate: 0.18, followRate: 0.12, gapMs: [800, 3000] },
  paused: { videos: [0, 0], watchMs: [0, 0], likeRate: 0, commentRate: 0, followRate: 0, gapMs: [0, 0] },
};

export type Rand = () => number;

const between = (rand: Rand, [lo, hi]: [number, number]): number =>
  Math.round(lo + rand() * (hi - lo));

/** Choose how many videos to consume — fit a target duration if given. */
function videosForTarget(profile: PhaseProfile, rand: Rand, targetMinutes?: number): number {
  if (profile.videos[1] === 0) return 0; // paused
  if (!targetMinutes || targetMinutes <= 0) return between(rand, profile.videos);
  const avgGap = (profile.gapMs[0] + profile.gapMs[1]) / 2;
  const avgWatch = (profile.watchMs[0] + profile.watchMs[1]) / 2;
  const perVideoMs = avgGap + avgWatch + 1200; // + engagement overhead
  const target = targetMinutes * 60_000;
  return Math.max(3, Math.min(150, Math.round(target / perVideoMs)));
}

/**
 * Build a randomized, human-like warmup session for an account in `phase`.
 * Pass a seeded `rand` for deterministic tests; defaults to Math.random.
 * `targetMinutes` (optional) scales the session to fit a desired duration.
 */
export function planWarmupSession(
  phase: WarmupPhase,
  rand: Rand = Math.random,
  targetMinutes?: number,
): WarmupPlan {
  const profile = PROFILES[phase] ?? PROFILES.cold;
  const videos = videosForTarget(profile, rand, targetMinutes);

  const actions: WarmupAction[] = [];
  let step = 0;
  let likes = 0;
  let comments = 0;
  let follows = 0;
  let estimatedDurationMs = 0;

  for (let i = 0; i < videos; i++) {
    // scroll to the next video
    const scrollDelay = between(rand, profile.gapMs);
    actions.push({ step: step++, type: "scroll", delayMs: scrollDelay });
    estimatedDurationMs += scrollDelay;

    // watch it for a human amount of time
    const watchMs = between(rand, profile.watchMs);
    actions.push({ step: step++, type: "watch", delayMs: 0, watchMs });
    estimatedDurationMs += watchMs;

    // longer videos / engaged watch => more likely to engage
    const engagement = watchMs / profile.watchMs[1]; // 0..1
    const likeChance = profile.likeRate * (0.6 + 0.8 * engagement);
    if (rand() < likeChance) {
      actions.push({ step: step++, type: "like", delayMs: between(rand, [400, 1500]) });
      likes++;
    }
    if (rand() < profile.commentRate) {
      actions.push({ step: step++, type: "comment", delayMs: between(rand, [2000, 6000]), needsComment: true });
      comments++;
    }
    if (rand() < profile.followRate) {
      actions.push({ step: step++, type: "follow", delayMs: between(rand, [800, 2500]) });
      follows++;
    }
  }

  // occasional long idle pause mid-session to look human
  if (videos > 6 && rand() < 0.5) {
    const idx = Math.floor(rand() * actions.length);
    const idle = between(rand, [8000, 25000]);
    actions.splice(idx, 0, { step: -1, type: "scroll", delayMs: idle });
    estimatedDurationMs += idle;
  }

  return { phase, videos, actions, likes, comments, follows, estimatedDurationMs };
}

/** Should this account run warmup now? Respects phase + min spacing. */
export function isWarmupDue(
  account: { warmup_phase: WarmupPhase; last_warmup_at?: string | null; min_hours_between_posts?: number },
  now = Date.now(),
): boolean {
  if (account.warmup_phase === "paused") return false;
  if (!account.last_warmup_at) return true;
  const minGapH = Math.max(4, (account.min_hours_between_posts ?? 12) / 2);
  return now - new Date(account.last_warmup_at).getTime() >= minGapH * 3_600_000;
}
