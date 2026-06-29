import { describe, test, expect } from "vitest";
import { cn, fmtCompact, fmtPct, relativeTime } from "@/lib/utils";

describe("cn", () => {
  test("merges and dedupes tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-fg", false && "hidden", "font-bold")).toBe("text-fg font-bold");
  });
});

describe("fmtCompact", () => {
  test("formats large numbers compactly", () => {
    expect(fmtCompact(12400)).toBe("12.4K");
    expect(fmtCompact(0)).toBe("0");
    expect(fmtCompact(null)).toBe("0");
  });
});

describe("fmtPct", () => {
  test("formats ratios as percentages", () => {
    expect(fmtPct(0.054)).toBe("5.4%");
    expect(fmtPct(null)).toBe("0%");
  });
});

describe("relativeTime", () => {
  test("returns never for null", () => {
    expect(relativeTime(null)).toBe("never");
  });

  test("formats recent timestamps", () => {
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    expect(relativeTime(oneHourAgo)).toBe("1h ago");
  });
});
