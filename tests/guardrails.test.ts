import { describe, it, expect } from "vitest";
import { checkGuardrails } from "@/lib/guardrails";

describe("checkGuardrails", () => {
  const prohibited = ["guaranteed results", "cure", "100% safe", "FDA approved"];

  it("flags a prohibited claim regardless of case", () => {
    const result = checkGuardrails("Our product gives GUARANTEED RESULTS in 7 days.", prohibited);
    expect(result.passed).toBe(false);
    expect(result.violations).toContain("guaranteed results");
  });

  it("passes clean text with no prohibited phrases", () => {
    const result = checkGuardrails("This product may help support your daily routine.", prohibited);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("collects multiple violations", () => {
    const result = checkGuardrails(
      "It is 100% safe and FDA approved for everyone.",
      prohibited,
    );
    expect(result.passed).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining(["100% safe", "FDA approved"]),
    );
    expect(result.violations).toHaveLength(2);
  });

  it("passes when the guardrails list is empty", () => {
    const result = checkGuardrails("Anything goes here, cure included.", []);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("ignores blank/whitespace guardrail entries", () => {
    const result = checkGuardrails("totally fine copy", ["", "   "]);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("matches a substring embedded mid-sentence", () => {
    const result = checkGuardrails("We believe this can cure many ills.", prohibited);
    expect(result.passed).toBe(false);
    expect(result.violations).toContain("cure");
  });
});
