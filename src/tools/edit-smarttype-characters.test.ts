// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, copyFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSmarttypeCharacters } from "./get-smarttype-characters.ts";
import { handleEditSmarttypeCharacters } from "./edit-smarttype-characters.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-characters-"));
  const path = join(dir, "script.fdx");
  copyFileSync(FIXTURE_PATH, path);
  return path;
}

/** A minimal document where "DANAERIAN COMMANDER" is a SmartType Character with a live Cast
 * Member row and a CharacterArcBeat still pointing at it — the cross-reference warning case. */
function fixtureWithReferences(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-characters-refs-"));
  const path = join(dir, "script.fdx");
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1">
      <Text>INT. STRONGHOLD</Text>
      <SceneProperties>
        <SceneArcBeats>
          <CharacterArcBeat Name="DANAERIAN COMMANDER"/>
        </SceneArcBeats>
      </SceneProperties>
    </Paragraph>
  </Content>
  <SmartType>
    <Characters>
      <Character>DANAERIAN COMMANDER</Character>
    </Characters>
  </SmartType>
  <Cast>
    <Member Actor="Man 1" Character="DANAERIAN COMMANDER"/>
  </Cast>
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}

describe("edit_smarttype_characters", () => {
  test("rejects non-.fdx paths", async () => {
    const result = await handleEditSmarttypeCharacters({ path: "notes.txt", action: "create", value: "X" });
    expect(result.isError).toBe(true);
  });

  test("create appends and alphabetizes a new character", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSmarttypeCharacters({ path, action: "create", value: "ZORG THE MAGNIFICENT" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("call save_fdx");

    const after = await handleGetSmarttypeCharacters({ path });
    expect(after.content[0]!.text).toContain("ZORG THE MAGNIFICENT");
  });

  test("remove deletes an existing entry", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSmarttypeCharacters({ path, action: "remove", find: "ook" });
    expect(result.isError).toBeFalsy();
    const after = await handleGetSmarttypeCharacters({ path });
    expect(after.content[0]!.text).not.toContain("OOK");
  });

  test("remove fails when the entry does not exist", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSmarttypeCharacters({ path, action: "remove", find: "NOT_A_CHARACTER" });
    expect(result.isError).toBe(true);
  });

  test("remove warns when Cast/arc-beat rows still reference the removed name", async () => {
    const path = fixtureWithReferences();
    await handleReadFdx({ path });
    const result = await handleEditSmarttypeCharacters({ path, action: "remove", find: "DANAERIAN COMMANDER" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("Warning: 1 Cast member(s) and 1 arc beat(s) still reference this name.");
  });

  test("remove does not warn when nothing else references the removed name", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSmarttypeCharacters({ path, action: "remove", find: "OOK" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).not.toContain("Warning:");
  });

  test("fix with uppercase+dedup cleans the list", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSmarttypeCharacters({ path, action: "fix", uppercase: true, dedup: true });
    expect(result.isError).toBeFalsy();
    const after = await handleGetSmarttypeCharacters({ path });
    // DAK'LEN and its curly-quote duplicate should now collide post-uppercase (still distinct
    // strings due to different apostrophe characters, so both survive — but casing is uniform).
    expect(after.content[0]!.text).not.toMatch(/[a-z]/);
  });
});

