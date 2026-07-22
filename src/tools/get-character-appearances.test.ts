// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetCharacterAppearances } from "./get-character-appearances.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("get_character_appearances", () => {
  test("path is required", async () => {
    expect((await handleGetCharacterAppearances({})).isError).toBe(true);
  });

  test("returns every character sorted by total descending", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetCharacterAppearances({ path: FIXTURE_PATH });
    const list = JSON.parse(result.content[0]!.text);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].total).toBeGreaterThanOrEqual(list[i].total);
    }
  });

  test("filters to one character case-insensitively", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetCharacterAppearances({ path: FIXTURE_PATH, character: "talpek" });
    const entry = JSON.parse(result.content[0]!.text);
    expect(entry.character).toBe("TALPEK");
    expect(entry.total).toBeGreaterThan(0);
    expect(Array.isArray(entry.appearances)).toBe(true);
  });

  test("reports no match without erroring", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetCharacterAppearances({ path: FIXTURE_PATH, character: "NOT_A_CHARACTER" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("no appearances found");
  });
});

