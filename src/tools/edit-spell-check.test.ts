// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSpellCheckLists } from "./get-spell-check-lists.ts";
import { handleEditSpellCheck } from "./edit-spell-check.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-spell-check-"));
  const path = join(dir, "script.fdx");
  copyFileSync(FIXTURE_PATH, path);
  return path;
}

describe("edit_spell_check", () => {
  test("rejects non-.fdx paths", async () => {
    const result = await handleEditSpellCheck({ path: "notes.txt", action: "create", value: "X" });
    expect(result.isError).toBe(true);
  });

  test("create appends a new ignored word, preserving ranges", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSpellCheck({ path, action: "create", value: "Zzyzx" });
    expect(result.isError).toBeFalsy();
    const after = await handleGetSpellCheckLists({ path });
    expect(after.content[0]!.text).toContain("Zzyzx");
    expect(after.content[0]!.text).toMatch(/\(\d+ ignore-ranges preserved\)/);
  });

  test("remove deletes an existing word", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSpellCheck({ path, action: "remove", find: "Altep" });
    expect(result.isError).toBeFalsy();
    const after = await handleGetSpellCheckLists({ path });
    expect(after.content[0]!.text).not.toMatch(/^Altep$/m);
  });

  test("remove fails when the word does not exist", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSpellCheck({ path, action: "remove", find: "NOT_A_WORD_XYZ" });
    expect(result.isError).toBe(true);
  });
});

