// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSpellCheckLists } from "./get-spell-check-lists.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("get_spell_check_lists", () => {
  test("path is required", async () => {
    expect((await handleGetSpellCheckLists({})).isError).toBe(true);
  });

  test("returns ignored words plus a preserved-ranges note", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetSpellCheckLists({ path: FIXTURE_PATH });
    const text = result.content[0]!.text;
    expect(text).toContain("Danaeri");
    expect(text).toMatch(/\(\d+ ignore-ranges preserved\)/);
  });
});

