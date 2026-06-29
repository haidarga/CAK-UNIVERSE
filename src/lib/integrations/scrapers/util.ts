// ============================================================
// Scraper text utilities — pure, no DOM, fully unit-tested.
// ============================================================

const SUFFIX_MULTIPLIER: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000,
};

/**
 * Parse a social-media count string into a number.
 *   "1.2M"  -> 1200000
 *   "12.3K" -> 12300
 *   "1,234" -> 1234
 *   "987"   -> 987
 * Returns 0 for empty / unparseable input. Never throws.
 */
export function parseCount(input: unknown): number {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input !== "string") return 0;

  const trimmed = input.trim();
  if (!trimmed) return 0;

  // Match an optional decimal number followed by an optional K/M/B suffix.
  // Commas are treated as thousands separators and stripped first.
  const cleaned = trimmed.replace(/,/g, "");
  const match = cleaned.match(/^([\d]*\.?[\d]+)\s*([kmb])?/i);
  if (!match) return 0;

  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return 0;

  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix ? (SUFFIX_MULTIPLIER[suffix] ?? 1) : 1;
  return Math.round(value * multiplier);
}
