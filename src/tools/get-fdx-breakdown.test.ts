import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetFdxBreakdown } from "./get-fdx-breakdown.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("get_fdx_breakdown", () => {
  test("path is required", async () => {
    expect((await handleGetFdxBreakdown({})).isError).toBe(true);
  });

  test("rejects an invalid asType", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetFdxBreakdown({ path: FIXTURE_PATH, asType: "xml" });
    expect(result.isError).toBe(true);
  });

  test("asType='text' (default) renders the expected sections", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetFdxBreakdown({ path: FIXTURE_PATH });
    const text = result.content[0]!.text;

    expect(text).toContain("SCRIPT BREAKDOWN");
    expect(text).toContain("DOCUMENT OVERVIEW");
    expect(text).toContain("Total Pages:        95");
    expect(text).toContain("Total Paragraphs:   1755");
    expect(text).toContain("Scenes:             89");
    expect(text).toContain("PARAGRAPH BREAKDOWN");
    expect(text).toContain("SCENE CATALOG");
    expect(text).toContain("CHARACTER FREQUENCY");
    expect(text).toContain("SCENE-LENGTH ANALYSIS");
    expect(text).toContain("PRODUCTION FLAGS");
  });

  test("asType='text' is the explicit-default equivalent", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const implicit = await handleGetFdxBreakdown({ path: FIXTURE_PATH });
    const explicit = await handleGetFdxBreakdown({ path: FIXTURE_PATH, asType: "text" });
    expect(implicit.content[0]!.text).toBe(explicit.content[0]!.text);
  });

  test("asType='html' renders a standalone styled page", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetFdxBreakdown({ path: FIXTURE_PATH, asType: "html" });
    const html = result.content[0]!.text;

    expect(html).toStartWith("<!doctype html>");
    expect(html).toContain("<title>Script Breakdown");
    expect(html).toContain("Document Overview");
    expect(html).toContain("<table>");
    expect(html).toContain("</html>");
  });

  test("asType='pdf' returns a base64-encoded PDF document", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetFdxBreakdown({ path: FIXTURE_PATH, asType: "pdf" });
    const base64 = result.content[0]!.text;

    expect(base64.length).toBeGreaterThan(0);
    const bytes = Uint8Array.fromBase64(base64);
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    expect(header).toBe("%PDF-");
  });

  test("asType is case-insensitive and trims whitespace", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetFdxBreakdown({ path: FIXTURE_PATH, asType: "  HTML  " });
    expect(result.content[0]!.text).toStartWith("<!doctype html>");
  });
});
