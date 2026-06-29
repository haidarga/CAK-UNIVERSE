import { describe, test, expect } from "vitest";
import { extractJson } from "@/lib/llm";

describe("extractJson", () => {
  test("parses a bare JSON object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  test("strips ```json fences", () => {
    expect(extractJson('```json\n{"a":1,"b":2}\n```')).toEqual({ a: 1, b: 2 });
  });

  test("ignores leading prose", () => {
    expect(extractJson('Sure! Here is the result:\n{"ok":true}')).toEqual({ ok: true });
  });

  test("ignores trailing commentary", () => {
    expect(extractJson('{"score":80} — hope that helps')).toEqual({ score: 80 });
  });

  test("parses arrays", () => {
    expect(extractJson("[1,2,3]")).toEqual([1, 2, 3]);
  });

  test("handles braces inside strings", () => {
    expect(extractJson('{"msg":"use {curly} braces"}')).toEqual({ msg: "use {curly} braces" });
  });

  test("throws when no JSON present", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});
