// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetCharacters } from "./get-characters.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("get_characters", () => {
  test("path is required", async () => {
    const result = await handleGetCharacters({});
    expect(result.isError).toBe(true);
  });

  test("returns the Characters SmartType list in alphabetized order", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetCharacters({ path: FIXTURE_PATH });
    const text = result.content[0]!.text;
    expect(text).toContain("ENSIGN");
    expect(text).toContain("TALPEK");
    // Case-insensitively alphabetized: "CAPTAIN darrian" precedes "COMMANDER gale".
    expect(text.indexOf("CAPTAIN darrian")).toBeLessThan(text.indexOf("COMMANDER gale"));
  });
});

