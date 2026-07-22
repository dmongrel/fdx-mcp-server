// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, copyFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSpellCheckLists } from "./get-spell-check-lists.ts";
import { handleEditSpellCheck } from "./edit-spell-check.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-spell-check-"));
  const path = join(dir, "script.fdx");
  copyFileSync(FIXTURE_PATH, path);
  return path;
}

// The shared fixture has no <IgnoredRanges> (no edit_* tool writes them), so the
// "preserving ranges" test needs a handcrafted document that actually has one.
function freshCopyWithIgnoreRange(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-spell-check-range-"));
  const path = join(dir, "script.fdx");
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content/>
  <SpellCheckIgnoreLists>
    <IgnoredRanges>
      <Range Start="0" End="4"/>
    </IgnoredRanges>
    <IgnoredWords>
      <Word>ALTEP</Word>
    </IgnoredWords>
  </SpellCheckIgnoreLists>
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}

describe("edit_spell_check", () => {
  test("rejects non-.fdx paths", async () => {
    const result = await handleEditSpellCheck({ path: "notes.txt", action: "create", value: "X" });
    expect(result.isError).toBe(true);
  });

  test("create appends a new ignored word, preserving ranges", async () => {
    const path = freshCopyWithIgnoreRange();
    await handleReadFdx({ path });
    const result = await handleEditSpellCheck({ path, action: "create", value: "Zzyzx" });
    expect(result.isError).toBeFalsy();
    const after = await handleGetSpellCheckLists({ path });
    expect(after.content[0]!.text).toContain("Zzyzx");
    expect(after.content[0]!.text).toMatch(/\(\d+ ignore-ranges? preserved\)/);
  });

  test("remove deletes an existing word", async () => {
    const path = freshCopyWithIgnoreRange();
    await handleReadFdx({ path });
    const result = await handleEditSpellCheck({ path, action: "remove", find: "Altep" });
    expect(result.isError).toBeFalsy();
    const after = await handleGetSpellCheckLists({ path });
    expect(after.content[0]!.text).not.toMatch(/^ALTEP$/m);
  });

  test("remove fails when the word does not exist", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSpellCheck({ path, action: "remove", find: "NOT_A_WORD_XYZ" });
    expect(result.isError).toBe(true);
  });
});

