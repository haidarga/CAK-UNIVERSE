import { describe, test, expect } from "vitest";
import { slugify, sanitizeBrandInput } from "@/lib/brand-input";

describe("slugify", () => {
  test("lowercases, strips punctuation, collapses to dashes", () => {
    expect(slugify("Glow Lokal! 2025")).toBe("glow-lokal-2025");
  });
  test("trims leading/trailing dashes", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
  });
  test("falls back to 'brand' for empty/garbage input", () => {
    expect(slugify("!!!")).toBe("brand");
    expect(slugify("")).toBe("brand");
  });
});

describe("sanitizeBrandInput", () => {
  test("create: fills defaults for missing fields", () => {
    const out = sanitizeBrandInput({ name: "X" });
    expect(out.platform).toBe("both");
    expect(out.status).toBe("active");
    expect(out.emotional_pillars).toEqual([]);
    expect(out.products).toEqual([]);
  });

  test("coerces invalid platform to 'both'", () => {
    expect(sanitizeBrandInput({ platform: "myspace" }).platform).toBe("both");
    expect(sanitizeBrandInput({ platform: "tiktok" }).platform).toBe("tiktok");
  });

  test("cleans arrays: trims, drops empties, dedupes", () => {
    const out = sanitizeBrandInput({ emotional_pillars: ["a", " a ", "", "b"] });
    expect(out.emotional_pillars).toEqual(["a", "b"]);
  });

  test("empty nullable string becomes null", () => {
    expect(sanitizeBrandInput({ campaign_tagline: "" }).campaign_tagline).toBeNull();
    expect(sanitizeBrandInput({ campaign_tagline: " hi " }).campaign_tagline).toBe("hi");
  });

  test("partial: only emits provided keys, no defaults", () => {
    const out = sanitizeBrandInput({ name: "Y" }, { partial: true });
    expect(out).toEqual({ name: "Y" });
    expect(out.platform).toBeUndefined();
    expect(out.emotional_pillars).toBeUndefined();
  });

  test("partial still coerces a provided platform", () => {
    expect(sanitizeBrandInput({ platform: "x" }, { partial: true }).platform).toBe("both");
  });
});
