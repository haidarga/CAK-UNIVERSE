// ============================================================
// Brand input normalization — shared by POST (create) + PATCH (update).
// Keeps array/nullable/enum coercion in one place so the two routes can't
// drift. PURE module (no server imports) — safe to unit-test directly.
// ============================================================

const PLATFORMS = ["tiktok", "instagram", "both"] as const;

/** string[] fields — coerced to a trimmed, non-empty, deduped list. */
const STR_ARRAY_FIELDS = [
  "emotional_pillars",
  "content_formats",
  "guardrails",
  "approved_claims",
  "hashtag_sets",
  "products",
  "hero_products",
] as const;

/** nullable single-string fields — "" becomes null. */
const NULLABLE_STR_FIELDS = [
  "campaign_tagline",
  "guidelines",
  "script_format",
  "cta_rules",
] as const;

// Length caps — these fields get serialized into LLM system prompts, so an
// unbounded value would flood the context window and burn tokens.
const NAME_MAX = 120;
const TEXT_MAX = 2000;
const ITEM_MAX = 200;
const LIST_MAX = 50;

/** "Glow Lokal!" -> "glow-lokal". Always returns a usable slug. */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "brand"
  );
}

function cleanList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue; // skip objects/arrays → no "[object Object]"
    const s = x.trim().slice(0, ITEM_MAX);
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
    if (out.length >= LIST_MAX) break;
  }
  return out;
}

/**
 * Normalize a brand payload into a DB-ready record.
 * With `partial`, only the provided keys are emitted (for PATCH).
 */
export function sanitizeBrandInput(
  body: Record<string, unknown>,
  opts: { partial?: boolean } = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const has = (k: string) => body[k] !== undefined;

  if (has("name")) out.name = String(body.name).trim().slice(0, NAME_MAX);
  if (has("platform"))
    out.platform = (PLATFORMS as readonly string[]).includes(body.platform as string)
      ? body.platform
      : "both";

  for (const k of NULLABLE_STR_FIELDS) {
    if (has(k)) {
      const s = body[k] == null ? "" : String(body[k]).trim().slice(0, TEXT_MAX);
      out[k] = s || null;
    }
  }
  for (const k of STR_ARRAY_FIELDS) {
    if (has(k)) out[k] = cleanList(body[k]);
  }

  // JSONB columns: validate STRUCTURE — never store arbitrary user-supplied
  // objects (they get re-serialized into LLM prompts downstream).
  if (has("posting_sweet_spot")) {
    const ps = body.posting_sweet_spot;
    if (ps && typeof ps === "object" && !Array.isArray(ps)) {
      const o = ps as Record<string, unknown>;
      const day = typeof o.day === "string" ? o.day.trim().slice(0, 20) : undefined;
      const hour = typeof o.hour === "string" ? o.hour.trim().slice(0, 10) : undefined;
      out.posting_sweet_spot = day || hour ? { day, hour } : null;
    } else {
      out.posting_sweet_spot = null;
    }
  }
  if (has("kpi_targets")) {
    const kt = body.kpi_targets;
    if (kt && typeof kt === "object" && !Array.isArray(kt)) {
      out.kpi_targets = Object.fromEntries(
        Object.entries(kt as Record<string, unknown>)
          .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
          .slice(0, 30),
      );
    } else {
      out.kpi_targets = null;
    }
  }
  if (has("status")) out.status = String(body.status).trim().slice(0, 40) || "active";

  // On create, fill sensible defaults for anything not provided.
  if (!opts.partial) {
    if (out.platform === undefined) out.platform = "both";
    if (out.status === undefined) out.status = "active";
    for (const k of STR_ARRAY_FIELDS) if (out[k] === undefined) out[k] = [];
  }

  return out;
}
