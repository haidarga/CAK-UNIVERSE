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
    const s = String(x).trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
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

  if (has("name")) out.name = String(body.name).trim();
  if (has("platform"))
    out.platform = (PLATFORMS as readonly string[]).includes(body.platform as string)
      ? body.platform
      : "both";

  for (const k of NULLABLE_STR_FIELDS) {
    if (has(k)) {
      const s = body[k] == null ? "" : String(body[k]).trim();
      out[k] = s || null;
    }
  }
  for (const k of STR_ARRAY_FIELDS) {
    if (has(k)) out[k] = cleanList(body[k]);
  }

  if (has("posting_sweet_spot")) out.posting_sweet_spot = body.posting_sweet_spot ?? null;
  if (has("kpi_targets")) out.kpi_targets = body.kpi_targets ?? null;
  if (has("status")) out.status = String(body.status).trim() || "active";

  // On create, fill sensible defaults for anything not provided.
  if (!opts.partial) {
    if (out.platform === undefined) out.platform = "both";
    if (out.status === undefined) out.status = "active";
    for (const k of STR_ARRAY_FIELDS) if (out[k] === undefined) out[k] = [];
  }

  return out;
}
