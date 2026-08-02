// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleGetSection } from "./get-section.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");
const SCENE_HEADING_ID = "6e39d99f-6972-42f8-bdc8-3f0dbe546280";

function items(result: { content: Array<{ text: string }> }): Array<Record<string, unknown>> {
  return JSON.parse(result.content[result.content.length - 1]!.text);
}

describe("get_section", () => {
  test("path is required", async () => {
    expect((await handleGetSection(undefined)).isError).toBe(true);
  });

  test("errors on an unknown section id", async () => {
    const result = await handleGetSection({ path: FIXTURE_PATH, id: "does-not-exist" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("section id not found");
  });

  test("returns the heading plus paragraphs up to the next section heading, with ids", async () => {
    const result = await handleGetSection({ path: FIXTURE_PATH, id: SCENE_HEADING_ID });
    expect(result.isError).toBeFalsy();
    const rows = items(result);
    expect(rows[0]).toEqual({ id: SCENE_HEADING_ID, type: "Scene Heading", text: "EXT. PREHISTORIC VALLEY - DAY" });
    // Must not include a second Scene Heading (that would mean it overran the boundary).
    const headingCount = rows.filter((r) => r.type === "Scene Heading").length;
    expect(headingCount).toBe(1);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      expect(typeof row.id).toBe("string");
      expect((row.id as string).length).toBeGreaterThan(0);
    }
  });

  test("omitting id starts at the first section in the document", async () => {
    const result = await handleGetSection({ path: FIXTURE_PATH });
    expect(result.isError).toBeFalsy();
    const rows = items(result);
    expect(rows[0]!.id).toBe(SCENE_HEADING_ID);
    expect(rows[0]!.type).toBe("Scene Heading");
  });
});
