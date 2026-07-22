// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetScriptStats } from "./get-script-stats.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("get_script_stats", () => {
  test("path is required", async () => {
    expect((await handleGetScriptStats({})).isError).toBe(true);
  });

  test("returns valid JSON metrics", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetScriptStats({ path: FIXTURE_PATH });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.totalPages).toBe(95);
    expect(parsed.sceneCount).toBe(89);
    expect(parsed.paragraphCount).toBe(1755);
    expect(parsed.byType["Scene Heading"]).toBe(89);
  });
});

