// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleGetTitlePage } from "./get-title-page.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

function allText(result: { content: Array<{ text: string }> }): string {
  return result.content.map((c) => c.text).join("\n");
}

describe("get_title_page", () => {
  test("path is required", async () => {
    expect((await handleGetTitlePage(undefined)).isError).toBe(true);
  });

  test("returns title page content concatenated top to bottom", async () => {
    const result = await handleGetTitlePage({ path: FIXTURE_PATH });
    expect(result.isError).toBeFalsy();
    const text = allText(result);
    expect(text).toContain("STAR TREK:  EMPIRES");
    expect(text).toContain("Joel L. Caesar");
    expect(text).toContain("Star Trek");
  });
});

