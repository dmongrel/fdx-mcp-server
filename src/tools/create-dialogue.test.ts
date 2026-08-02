// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleCreateDialogue } from "./create-dialogue.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");
const FIXTURE_SOURCE = readFileSync(FIXTURE_PATH, "utf-8");

function freshDoc(key: string): { path: string; doc: FdxDocument } {
  const path = join(import.meta.dir, `create-dialogue-${key}.fdx`);
  const doc = FdxDocument.parse(FIXTURE_SOURCE, path);
  documentCache.set(path, doc);
  return { path, doc };
}

describe("create_dialogue", () => {
  test("path, character, and dialogue are required", async () => {
    expect((await handleCreateDialogue({ character: "X", dialogue: "y" })).isError).toBe(true);
    const { path } = freshDoc("missing-fields");
    expect((await handleCreateDialogue({ path, dialogue: "y" })).isError).toBe(true);
    expect((await handleCreateDialogue({ path, character: "X" })).isError).toBe(true);
  });

  test("creates a contiguous Character/Dialogue pair with no parenthetical", async () => {
    const { path, doc } = freshDoc("pair-only");
    const before = doc.getParagraphElements().length;

    const result = await handleCreateDialogue({ path, character: "ZZZ NEW SPEAKER", dialogue: "Hello there." });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[result.content.length - 1]!.text);
    expect(body.parentheticalId).toBeNull();
    expect(typeof body.characterId).toBe("string");
    expect(typeof body.dialogueId).toBe("string");

    const after = doc.getParagraphElements();
    expect(after.length).toBe(before + 2);
    const charIdx = after.findIndex((p) => getParagraphId(p) === body.characterId);
    const dialogueIdx = after.findIndex((p) => getParagraphId(p) === body.dialogueId);
    expect(dialogueIdx).toBe(charIdx + 1);
    expect(getParagraphType(after[charIdx]!)).toBe("Character");
    expect(paragraphText(after[charIdx]!)).toBe("ZZZ NEW SPEAKER");
    expect(getParagraphType(after[dialogueIdx]!)).toBe("Dialogue");
    expect(paragraphText(after[dialogueIdx]!)).toBe("Hello there.");
  });

  test("creates a contiguous Character/Parenthetical/Dialogue group", async () => {
    const { path, doc } = freshDoc("with-parenthetical");
    const before = doc.getParagraphElements().length;

    const result = await handleCreateDialogue({
      path,
      character: "ZZZ SPEAKER TWO",
      parenthetical: "(shouting)",
      dialogue: "Get down!",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[result.content.length - 1]!.text);
    expect(typeof body.parentheticalId).toBe("string");

    const after = doc.getParagraphElements();
    expect(after.length).toBe(before + 3);
    const charIdx = after.findIndex((p) => getParagraphId(p) === body.characterId);
    const parenIdx = after.findIndex((p) => getParagraphId(p) === body.parentheticalId);
    const dialogueIdx = after.findIndex((p) => getParagraphId(p) === body.dialogueId);
    expect(parenIdx).toBe(charIdx + 1);
    expect(dialogueIdx).toBe(parenIdx + 1);
    expect(getParagraphType(after[parenIdx]!)).toBe("Parenthetical");
    expect(paragraphText(after[parenIdx]!)).toBe("(shouting)");
  });

  test("adds character's text to the SmartType Characters list", async () => {
    const { path, doc } = freshDoc("smarttype-refresh");
    await handleCreateDialogue({ path, character: "ZZZ THIRD SPEAKER", dialogue: "Hi." });
    const list = doc.getSmartTypeList("Character")!;
    expect(list.values).toContain("ZZZ THIRD SPEAKER");
  });

  test("beforeParId inserts the group immediately before the anchor", async () => {
    const { path, doc } = freshDoc("before-anchor");
    const anchor = doc.getParagraphElements()[2]!;
    const anchorId = getParagraphId(anchor);

    const result = await handleCreateDialogue({ path, character: "ZZZ BEFORE", dialogue: "x", beforeParId: anchorId });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[result.content.length - 1]!.text);

    const paragraphs = doc.getParagraphElements();
    const anchorIdx = paragraphs.findIndex((p) => getParagraphId(p) === anchorId);
    expect(getParagraphId(paragraphs[anchorIdx - 2]!)).toBe(body.characterId);
    expect(getParagraphId(paragraphs[anchorIdx - 1]!)).toBe(body.dialogueId);
  });

  test("afterParId inserts the group immediately after the anchor", async () => {
    const { path, doc } = freshDoc("after-anchor");
    const anchor = doc.getParagraphElements()[2]!;
    const anchorId = getParagraphId(anchor);

    const result = await handleCreateDialogue({ path, character: "ZZZ AFTER", dialogue: "x", afterParId: anchorId });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[result.content.length - 1]!.text);

    const paragraphs = doc.getParagraphElements();
    const anchorIdx = paragraphs.findIndex((p) => getParagraphId(p) === anchorId);
    expect(getParagraphId(paragraphs[anchorIdx + 1]!)).toBe(body.characterId);
    expect(getParagraphId(paragraphs[anchorIdx + 2]!)).toBe(body.dialogueId);
  });

  test("an unknown anchor id fails and creates nothing", async () => {
    const { path, doc } = freshDoc("bad-anchor");
    const before = doc.getParagraphElements().length;

    const result = await handleCreateDialogue({ path, character: "X", dialogue: "y", beforeParId: "does-not-exist" });
    expect(result.isError).toBe(true);
    expect(doc.getParagraphElements().length).toBe(before);
  });
});
