// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSpellCheckLists } from "./get-spell-check-lists.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

// The shared fixture has no <IgnoredRanges>/<IgnoredWords> (no edit_* tool writes ranges), so
// this needs a handcrafted document that actually has some.
function fixtureWithIgnoreRange(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-get-spell-check-"));
  const path = join(dir, "script.fdx");
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content/>
  <SpellCheckIgnoreLists>
    <IgnoredRanges>
      <Range Start="0" End="4"/>
    </IgnoredRanges>
    <IgnoredWords>
      <Word>UBGA</Word>
    </IgnoredWords>
  </SpellCheckIgnoreLists>
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}

describe("get_spell_check_lists", () => {
  test("path is required", async () => {
    expect((await handleGetSpellCheckLists({})).isError).toBe(true);
  });

  test("returns ignored words plus a preserved-ranges note", async () => {
    const path = fixtureWithIgnoreRange();
    await handleReadFdx({ path });
    const result = await handleGetSpellCheckLists({ path });
    const text = result.content[0]!.text;
    expect(text).toContain("UBGA");
    expect(text).toMatch(/\(\d+ ignore-ranges? preserved\)/);
  });

  test("returns 'No ignored words' when the fixture has none", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetSpellCheckLists({ path: FIXTURE_PATH });
    expect(result.content[0]!.text).toContain("No ignored words");
  });
});

