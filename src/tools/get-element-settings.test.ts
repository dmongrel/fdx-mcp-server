// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleGetElementSettings } from "./get-element-settings.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

function allText(result: { content: Array<{ text: string }> }): string {
  return result.content.map((c) => c.text).join("\n");
}

describe("get_element_settings", () => {
  test("path and type are required", async () => {
    expect((await handleGetElementSettings({ type: "General" })).isError).toBe(true);
    expect((await handleGetElementSettings({ path: FIXTURE_PATH })).isError).toBe(true);
  });

  test("returns the ElementSettings record for a known type", async () => {
    const result = await handleGetElementSettings({ path: FIXTURE_PATH, type: "General" });
    expect(result.isError).toBeFalsy();
    const text = allText(result);
    expect(text).toContain("ElementSettings");
    expect(text).toContain('Type="General"');
  });

  test("errors on an unknown type", async () => {
    const result = await handleGetElementSettings({ path: FIXTURE_PATH, type: "Book Part" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
  });
});

