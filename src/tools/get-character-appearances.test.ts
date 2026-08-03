// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetCharacterAppearances } from "./get-character-appearances.ts";
import { handleEditDualDialogue } from "./edit-dual-dialogue.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-get-character-appearances-"));
  const path = join(dir, "script.fdx");
  copyFileSync(FIXTURE_PATH, path);
  return path;
}

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
    const result = await handleGetCharacterAppearances({ path: FIXTURE_PATH, character: "ook" });
    const entry = JSON.parse(result.content[0]!.text);
    expect(entry.character).toBe("OOK");
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

describe("get_character_appearances with a DualDialogue in the document", () => {
  const CHARACTER_ID = "a3049b85-f812-4aaa-9532-9f53f774f758";
  const PARENTHETICAL_ID = "bbee1c41-6ca4-4ae2-bb0e-4c2769f23a16";
  const DIALOGUE_ID = "b5437965-e39f-4236-a0c0-641860dcfb96";

  test("whole-document call reports the skipped-nested count", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    await handleEditDualDialogue({
      path,
      action: "create",
      ids: [CHARACTER_ID, PARENTHETICAL_ID, DIALOGUE_ID],
    });
    const result = await handleGetCharacterAppearances({ path });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain(
      "3 paragraph(s) nested inside a DualDialogue block were not scanned by this call.",
    );
  });

  test("no DualDialogue means no warning", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleGetCharacterAppearances({ path });
    expect(result.content[0]!.text).not.toContain("nested inside a DualDialogue");
  });
});

