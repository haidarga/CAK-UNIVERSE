// ============================================================
// Pure guardrail check — deterministic, no DB, no LLM.
// Case-insensitive substring match against prohibited phrases.
// Used by ScriptWriterAgent to flag non-compliant scripts.
// ============================================================

export interface GuardrailResult {
  passed: boolean;
  violations: string[];
}

/**
 * Scan `text` for any prohibited phrase in `guardrails`.
 * Match is case-insensitive substring (whitespace-trimmed).
 * Returns the list of phrases that were violated.
 */
export function checkGuardrails(text: string, guardrails: string[]): GuardrailResult {
  if (!text || !Array.isArray(guardrails) || guardrails.length === 0) {
    return { passed: true, violations: [] };
  }

  const haystack = text.toLowerCase();
  const violations: string[] = [];

  for (const rule of guardrails) {
    const needle = (rule ?? "").trim().toLowerCase();
    if (needle.length === 0) continue;
    if (haystack.includes(needle)) violations.push(rule);
  }

  return { passed: violations.length === 0, violations };
}
