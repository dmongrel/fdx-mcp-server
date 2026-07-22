// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleGetSectionParList } from "./get-section-par-list.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");
const SCENE_HEADING_ID = "3c4f7ca7-60ba-4af1-bf97-19c7c36151c5";

function allText(result: { content: Array<{ text: string }> }): string {
  return result.content.map((c) => c.text).join("\n");
}

describe("get_section_par_list", () => {
  test("path is required", async () => {
    expect((await handleGetSectionParList(undefined)).isError).toBe(true);
  });

  test("includes the section heading itself plus following paragraphs", async () => {
    const result = await handleGetSectionParList({ path: FIXTURE_PATH, id: SCENE_HEADING_ID });
    expect(result.isError).toBeFalsy();
    const text = allText(result);
    const lines = text.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("[cache warning]"));
    expect(lines[0]).toContain(SCENE_HEADING_ID);
    expect(lines.length).toBeGreaterThan(1);
  });

  test("omitting id starts at the first section", async () => {
    const result = await handleGetSectionParList({ path: FIXTURE_PATH });
    expect(result.isError).toBeFalsy();
    expect(allText(result)).toContain("8b13e7dc-34b7-4879-8398-aca9f18b90ce");
  });

  test("errors on an unknown section id", async () => {
    const result = await handleGetSectionParList({ path: FIXTURE_PATH, id: "does-not-exist" });
    expect(result.isError).toBe(true);
    expect(allText(result)).toContain("section id not found");
  });
});

