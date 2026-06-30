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

  // --- security hardening ---
  test("posting_sweet_spot: keeps only string day/hour, strips extras", () => {
    const out = sanitizeBrandInput({
      posting_sweet_spot: { day: " Sabtu ", hour: "19:00", evil: { a: 1 } },
    });
    expect(out.posting_sweet_spot).toEqual({ day: "Sabtu", hour: "19:00" });
  });

  test("posting_sweet_spot: arrays / non-objects become null", () => {
    expect(sanitizeBrandInput({ posting_sweet_spot: [1, 2, 3] }).posting_sweet_spot).toBeNull();
    expect(sanitizeBrandInput({ posting_sweet_spot: "x" }).posting_sweet_spot).toBeNull();
  });

  test("kpi_targets: keeps only finite numbers, drops the rest", () => {
    const out = sanitizeBrandInput({
      kpi_targets: { views: 1000, label: "nope", nan: NaN, rate: 4.2 },
    });
    expect(out.kpi_targets).toEqual({ views: 1000, rate: 4.2 });
  });

  test("kpi_targets: array becomes null", () => {
    expect(sanitizeBrandInput({ kpi_targets: [1, 2] }).kpi_targets).toBeNull();
  });

  test("caps name length to 120 and list items to 200", () => {
    const out = sanitizeBrandInput({
      name: "x".repeat(500),
      products: ["y".repeat(500)],
    });
    expect((out.name as string).length).toBe(120);
    expect((out.products as string[])[0].length).toBe(200);
  });

  test("cleanList caps list length at 50 and skips non-strings", () => {
    const out = sanitizeBrandInput({
      products: [...Array.from({ length: 80 }, (_, i) => `p${i}`), { obj: 1 }],
    });
    expect((out.products as string[]).length).toBe(50);
    expect((out.products as string[]).every((x) => typeof x === "string")).toBe(true);
  });
});
