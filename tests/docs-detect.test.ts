import { describe, test, expect } from "vitest";
import { detectGoogle } from "@/components/docs/docs-panel";

describe("detectGoogle", () => {
  test("detects a Google Doc with an id", () => {
    expect(detectGoogle("https://docs.google.com/document/d/1AbcDEF_ghIJKlmno123/edit")).toEqual({
      kind: "doc",
      provider: "google_docs",
    });
  });

  test("detects a Google Sheet with an id", () => {
    expect(
      detectGoogle("https://docs.google.com/spreadsheets/d/1ZyXwv_UTSrqponm456/edit#gid=0"),
    ).toEqual({ kind: "sheet", provider: "google_sheets" });
  });

  test("handles the /u/0 account-switcher prefix", () => {
    expect(detectGoogle("https://docs.google.com/document/u/0/d/1AbcDEF_ghIJKlmno123/edit")).toEqual(
      { kind: "doc", provider: "google_docs" },
    );
  });

  test("rejects a bare document URL with no id", () => {
    expect(detectGoogle("https://docs.google.com/document/")).toBeNull();
  });

  test("rejects non-Google and other Google products", () => {
    expect(detectGoogle("https://example.com/document/d/1Abc")).toBeNull();
    expect(detectGoogle("https://docs.google.com/forms/d/1Abc/edit")).toBeNull();
    expect(detectGoogle("https://docs.google.com/drawings/d/1Abc/edit")).toBeNull();
  });

  test("rejects empty / garbage input", () => {
    expect(detectGoogle("")).toBeNull();
    expect(detectGoogle("not a url")).toBeNull();
  });
});
