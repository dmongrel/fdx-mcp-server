// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetCast } from "./get-cast.ts";
import { handleEditCast } from "./edit-cast.ts";
import { documentCache } from "../fdx/cache.ts";
import { findChild, findChildren, getAttr } from "../fdx/xml.ts";

const WIN_VOICE_BLOB = "‘Q|Çg(Ð„{DEST";

function fixtureWithCast(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-cast-"));
  const path = join(dir, "script.fdx");
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1"><Text>EXT. BRIDGE - DAY</Text></Paragraph>
    <Paragraph Type="Character" id="c1"><Text>DAK'LEN</Text></Paragraph>
  </Content>
  <SmartType>
    <Characters>
      <Character>DAK'LEN</Character>
    </Characters>
  </SmartType>
  <Actors>
    <Actor MacVoice="" Name="Man 1" Pitch="Normal" Speed="Medium" WinVoice="${WIN_VOICE_BLOB}"/>
    <Actor MacVoice="" Name="Old Man" Pitch="Normal" Speed="Medium" WinVoice=""/>
  </Actors>
  <Cast>
    <Narrator Actor="Man 1">
      <Element Type="Character"/>
      <Element Type="Dialogue"/>
    </Narrator>
    <Member Actor="Old Man" Character="DAK'LEN"/>
    <Member Actor="Man 1" Character="DANAERIAN COMMANDER"/>
  </Cast>
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}

/** The exact WinVoice value for Actor "Man 1", read straight off the cached document's XML tree. */
function readWinVoice(path: string): string | undefined {
  const doc = documentCache.get(path)!;
  const actors = findChild(doc.root, "Actors")!;
  const manOne = findChildren(actors, "Actor").find((a) => getAttr(a, "Name") === "Man 1")!;
  return getAttr(manOne, "WinVoice");
}

describe("edit_cast", () => {
  test("path/action are required", async () => {
    expect((await handleEditCast({})).isError).toBe(true);
    const path = fixtureWithCast();
    await handleReadFdx({ path });
    expect((await handleEditCast({ path })).isError).toBe(true);
  });

  test("rejects a non-.fdx path", async () => {
    const result = await handleEditCast({ path: "script.txt", action: "create", character: "X", actor: "Man 1" });
    expect(result.isError).toBe(true);
  });

  test("create adds a Member row and rejects a duplicate character", async () => {
    const path = fixtureWithCast();
    await handleReadFdx({ path });

    const result = await handleEditCast({ path, action: "create", character: "V'CTUEN", actor: "Old Man" });
    expect(result.isError).toBeFalsy();
    const after = JSON.parse((await handleGetCast({ path })).content[0]!.text);
    expect(after.members).toContainEqual({ character: "V'CTUEN", actor: "Old Man" });

    const dupe = await handleEditCast({ path, action: "create", character: "v'ctuen", actor: "Man 1" });
    expect(dupe.isError).toBe(true);
    expect(dupe.content[0]!.text).toContain("already exists");
  });

  test("create requires character and actor", async () => {
    const path = fixtureWithCast();
    await handleReadFdx({ path });
    expect((await handleEditCast({ path, action: "create", actor: "Man 1" })).isError).toBe(true);
    expect((await handleEditCast({ path, action: "create", character: "X" })).isError).toBe(true);
  });

  test("edit changes actor and/or character on the matching row", async () => {
    const path = fixtureWithCast();
    await handleReadFdx({ path });

    const result = await handleEditCast({ path, action: "edit", character: "dak'len", actor: "Man 1" });
    expect(result.isError).toBeFalsy();
    let after = JSON.parse((await handleGetCast({ path })).content[0]!.text);
    expect(after.members).toContainEqual({ character: "DAK'LEN", actor: "Man 1" });

    await handleEditCast({ path, action: "edit", character: "DAK'LEN", newCharacter: "DAKLEN" });
    after = JSON.parse((await handleGetCast({ path })).content[0]!.text);
    expect(after.members.some((m: any) => m.character === "DAKLEN")).toBe(true);
    expect(after.members.some((m: any) => m.character === "DAK'LEN")).toBe(false);
  });

  test("edit fails for an unknown character and when neither actor nor newCharacter is given", async () => {
    const path = fixtureWithCast();
    await handleReadFdx({ path });
    expect((await handleEditCast({ path, action: "edit", character: "NOPE", actor: "Man 1" })).isError).toBe(true);
    expect((await handleEditCast({ path, action: "edit", character: "DAK'LEN" })).isError).toBe(true);
  });

  test("remove deletes the matching row, case-sensitively when cs=true", async () => {
    const path = fixtureWithCast();
    await handleReadFdx({ path });

    const wrongCase = await handleEditCast({ path, action: "remove", character: "dak'len", cs: true });
    expect(wrongCase.isError).toBe(true);

    const result = await handleEditCast({ path, action: "remove", character: "DAK'LEN" });
    expect(result.isError).toBeFalsy();
    const after = JSON.parse((await handleGetCast({ path })).content[0]!.text);
    expect(after.members.some((m: any) => m.character === "DAK'LEN")).toBe(false);
  });

  test("fix drops rows with no Character cue and no SmartType entry, keeps rows that have either", async () => {
    const path = fixtureWithCast();
    await handleReadFdx({ path });

    const result = await handleEditCast({ path, action: "fix" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("DANAERIAN COMMANDER");

    const after = JSON.parse((await handleGetCast({ path })).content[0]!.text);
    expect(after.members).toEqual([{ character: "DAK'LEN", actor: "Old Man" }]);
  });

  test("fix is a no-op when there are no orphans", async () => {
    const path = fixtureWithCast();
    await handleReadFdx({ path });
    await handleEditCast({ path, action: "remove", character: "DANAERIAN COMMANDER" });

    const result = await handleEditCast({ path, action: "fix" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("No orphaned cast members found");
  });

  test("hazard: create/edit/remove/fix never touch <Actors> WinVoice, byte for byte", async () => {
    const path = fixtureWithCast();
    await handleReadFdx({ path });
    expect(readWinVoice(path)).toBe(WIN_VOICE_BLOB);

    await handleEditCast({ path, action: "create", character: "V'CTUEN", actor: "Man 1" });
    await handleEditCast({ path, action: "edit", character: "DAK'LEN", actor: "Man 1", newCharacter: "DAKLEN" });
    await handleEditCast({ path, action: "remove", character: "V'CTUEN" });
    await handleEditCast({ path, action: "fix" });

    expect(readWinVoice(path)).toBe(WIN_VOICE_BLOB);

    // And the serialized document — not just the in-memory tree — still carries it untouched.
    const doc = documentCache.get(path)!;
    expect(doc.serialize()).toContain(`WinVoice="${WIN_VOICE_BLOB}"`);
  });
});
