// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleGetSection } from "./get-section.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");
const SCENE_HEADING_ID = "6e39d99f-6972-42f8-bdc8-3f0dbe546280";

function allText(result: { content: Array<{ text: string }> }): string {
  return result.content.map((c) => c.text).join("\n");
}

describe("get_section", () => {
  test("path is required", async () => {
    expect((await handleGetSection(undefined)).isError).toBe(true);
  });

  test("errors on an unknown section id", async () => {
    const result = await handleGetSection({ path: FIXTURE_PATH, id: "does-not-exist" });
    expect(result.isError).toBe(true);
    expect(allText(result)).toContain("section id not found");
  });

  test("returns the heading plus paragraphs up to the next section heading", async () => {
    const result = await handleGetSection({ path: FIXTURE_PATH, id: SCENE_HEADING_ID });
    expect(result.isError).toBeFalsy();
    const text = allText(result);
    expect(text).toContain("[Scene Heading]");
    expect(text).toContain("EXT. PREHISTORIC VALLEY - DAY");
    // Must not include a second Scene Heading block (that would mean it overran the boundary).
    const headingCount = (text.match(/\[Scene Heading\]/g) ?? []).length;
    expect(headingCount).toBe(1);
  });

  test("omitting id starts from the very first paragraph", async () => {
    const result = await handleGetSection({ path: FIXTURE_PATH });
    expect(result.isError).toBeFalsy();
    // The document opens with a Scene Heading section.
    expect(allText(result)).toContain("[Scene Heading]");
  });
});

