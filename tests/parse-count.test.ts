import { describe, test, expect } from "vitest";
import { parseCount } from "@/lib/integrations/scrapers/util";

describe("parseCount", () => {
  test("parses millions suffix", () => {
    expect(parseCount("1.2M")).toBe(1_200_000);
  });

  test("parses thousands suffix", () => {
    expect(parseCount("12.3K")).toBe(12_300);
  });

  test("parses comma-separated integers", () => {
    expect(parseCount("1,234")).toBe(1_234);
  });

  test("parses plain integers", () => {
    expect(parseCount("987")).toBe(987);
  });

  test("returns 0 for bad input", () => {
    expect(parseCount("")).toBe(0);
    expect(parseCount("   ")).toBe(0);
    expect(parseCount("abc")).toBe(0);
    expect(parseCount(null)).toBe(0);
    expect(parseCount(undefined)).toBe(0);
    expect(parseCount({})).toBe(0);
  });

  test("handles billions and lowercase suffixes", () => {
    expect(parseCount("2B")).toBe(2_000_000_000);
    expect(parseCount("3.5m")).toBe(3_500_000);
  });

  test("passes through finite numbers", () => {
    expect(parseCount(42)).toBe(42);
    expect(parseCount(Number.NaN)).toBe(0);
  });
});
