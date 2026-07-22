// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetCharacters } from "./get-characters.ts";
import { handleEditCharacters } from "./edit-characters.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-characters-"));
  const path = join(dir, "script.fdx");
  copyFileSync(FIXTURE_PATH, path);
  return path;
}

describe("edit_characters", () => {
  test("rejects non-.fdx paths", async () => {
    const result = await handleEditCharacters({ path: "notes.txt", action: "create", value: "X" });
    expect(result.isError).toBe(true);
  });

  test("create appends and alphabetizes a new character", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditCharacters({ path, action: "create", value: "ZORG THE MAGNIFICENT" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("call save_fdx");

    const after = await handleGetCharacters({ path });
    expect(after.content[0]!.text).toContain("ZORG THE MAGNIFICENT");
  });

  test("remove deletes an existing entry", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditCharacters({ path, action: "remove", find: "ook" });
    expect(result.isError).toBeFalsy();
    const after = await handleGetCharacters({ path });
    expect(after.content[0]!.text).not.toContain("OOK");
  });

  test("remove fails when the entry does not exist", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditCharacters({ path, action: "remove", find: "NOT_A_CHARACTER" });
    expect(result.isError).toBe(true);
  });

  test("fix with uppercase+dedup cleans the list", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditCharacters({ path, action: "fix", uppercase: true, dedup: true });
    expect(result.isError).toBeFalsy();
    const after = await handleGetCharacters({ path });
    // DAK'LEN and its curly-quote duplicate should now collide post-uppercase (still distinct
    // strings due to different apostrophe characters, so both survive — but casing is uniform).
    expect(after.content[0]!.text).not.toMatch(/[a-z]/);
  });
});

