import { describe, test, expect } from "vitest";
import { topicToTags } from "@/lib/research";

describe("topicToTags", () => {
  test("derives joined token + individual words", () => {
    expect(topicToTags("skincare lokal")).toEqual(["skincarelokal", "skincare", "lokal"]);
  });

  test("lowercases and strips punctuation", () => {
    expect(topicToTags("Tabungan Anak!")).toEqual(["tabungananak", "tabungan", "anak"]);
  });

  test("dedupes a single word to one tag", () => {
    expect(topicToTags("skincare")).toEqual(["skincare"]);
  });

  test("caps at 3 tags", () => {
    expect(topicToTags("a b c d")).toEqual(["abcd", "a", "b"]);
  });

  test("returns [] for empty / punctuation-only input", () => {
    expect(topicToTags("")).toEqual([]);
    expect(topicToTags("!!!")).toEqual([]);
    expect(topicToTags("   ")).toEqual([]);
  });

  test("collapses extra whitespace", () => {
    expect(topicToTags("  finance   app  ")).toEqual(["financeapp", "finance", "app"]);
  });
});
