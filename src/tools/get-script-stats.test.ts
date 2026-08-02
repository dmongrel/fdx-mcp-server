// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetScriptStats } from "./get-script-stats.ts";
import { handleEditPar } from "./edit-par.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-get-script-stats-"));
  const path = join(dir, "script.fdx");
  copyFileSync(FIXTURE_PATH, path);
  return path;
}

describe("get_script_stats", () => {
  test("path is required", async () => {
    expect((await handleGetScriptStats({})).isError).toBe(true);
  });

  test("returns valid JSON metrics", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetScriptStats({ path: FIXTURE_PATH });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.totalPages).toBe(0);
    expect(parsed.sceneCount).toBe(6);
    expect(parsed.paragraphCount).toBe(53);
    expect(parsed.byType["Scene Heading"]).toBe(6);
  });

  test("excludePlaceholders is passed through to buildScriptStats", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    await handleEditPar({ path, action: "create", type: "General", textRuns: [{ content: "[FIX - temp placeholder]" }] });

    const withPlaceholder = await handleGetScriptStats({ path });
    const withBody = JSON.parse(withPlaceholder.content[withPlaceholder.content.length - 1]!.text);
    expect(withBody.placeholderCount).toBe(1);

    const excludedResult = await handleGetScriptStats({ path, excludePlaceholders: true });
    const excludedBody = JSON.parse(excludedResult.content[excludedResult.content.length - 1]!.text);
    expect(excludedBody.paragraphCount).toBe(withBody.paragraphCount - 1);
    expect(excludedBody.placeholderCount).toBe(1);
  });
});

