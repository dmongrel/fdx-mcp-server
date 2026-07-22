// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleGetSectionList } from "./get-section-list.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

function allText(result: { content: Array<{ text: string }> }): string {
  return result.content.map((c) => c.text).join("\n");
}

describe("get_section_list", () => {
  test("path is required", async () => {
    expect((await handleGetSectionList(undefined)).isError).toBe(true);
  });

  test("lists all section types, not just scene headings", async () => {
    const result = await handleGetSectionList({ path: FIXTURE_PATH });
    expect(result.isError).toBeFalsy();
    const text = allText(result);
    const lines = text.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("[cache warning]"));
    expect(lines.some((l) => l.startsWith("Scene Heading ["))).toBe(true);
    expect(lines.some((l) => l.startsWith("Act&Scene Break ["))).toBe(true);
  });

  test("type filter lists only that type, case-insensitively", async () => {
    const all = allText(await handleGetSectionList({ path: FIXTURE_PATH }));
    const scenesOnly = await handleGetSectionList({ path: FIXTURE_PATH, type: "scene heading" });
    expect(scenesOnly.isError).toBeFalsy();
    const scenesText = allText(scenesOnly);
    const lines = scenesText.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("[cache warning]"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.startsWith("Scene Heading [")).toBe(true);
    }
    expect(lines.length).toBeLessThan(all.split("\n").filter((l) => l.trim() !== "").length);
  });

  test("rejects a non-section type filter", async () => {
    const result = await handleGetSectionList({ path: FIXTURE_PATH, type: "Dialogue" });
    expect(result.isError).toBe(true);
    expect(allText(result)).toContain("not a section type");
  });

  test("start id may be any section type", async () => {
    const result = await handleGetSectionList({ path: FIXTURE_PATH, id: "89e6c679-e1be-447e-88f5-589f1b3325e7" });
    expect(result.isError).toBeFalsy();
  });

  test("bad start id errors", async () => {
    const result = await handleGetSectionList({ path: FIXTURE_PATH, id: "does-not-exist" });
    expect(result.isError).toBe(true);
  });
});

