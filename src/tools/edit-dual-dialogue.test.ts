// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetDualDialogue } from "./get-dual-dialogue.ts";
import { handleEditDualDialogue } from "./edit-dual-dialogue.ts";
import { documentCache } from "../fdx/cache.ts";
import { getParagraphId } from "../fdx/paragraph.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");
const CHARACTER_ID = "a3049b85-f812-4aaa-9532-9f53f774f758"; // "GROG" Character paragraph
const PARENTHETICAL_ID = "bbee1c41-6ca4-4ae2-bb0e-4c2769f23a16"; // "(shouting)"
const DIALOGUE_ID = "b5437965-e39f-4236-a0c0-641860dcfb96"; // "Ook, move!"

function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-dual-dialogue-"));
  const path = join(dir, "script.fdx");
  copyFileSync(FIXTURE_PATH, path);
  return path;
}

describe("edit_dual_dialogue / get_dual_dialogue", () => {
  test("rejects non-.fdx paths", async () => {
    const result = await handleEditDualDialogue({ path: "notes.txt", action: "create", ids: [CHARACTER_ID] });
    expect(result.isError).toBe(true);
  });

  test("create moves paragraphs into a new wrapper, preserving order", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditDualDialogue({
      path,
      action: "create",
      ids: [CHARACTER_ID, PARENTHETICAL_ID, DIALOGUE_ID],
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("call save_fdx");

    const doc = documentCache.get(path)!;
    const paragraphs = doc.getParagraphElements();

    // The three moved paragraphs are no longer top-level.
    const topLevelIds = paragraphs.map(getParagraphId);
    expect(topLevelIds).not.toContain(CHARACTER_ID);
    expect(topLevelIds).not.toContain(PARENTHETICAL_ID);
    expect(topLevelIds).not.toContain(DIALOGUE_ID);

    const wrapper = paragraphs.find((p) =>
      p.children.some((c) => c.type === "element" && c.name === "DualDialogue"),
    );
    expect(wrapper).toBeDefined();
    const wrapperId = getParagraphId(wrapper!);
    const getResult = await handleGetDualDialogue({ path, id: wrapperId });
    expect(getResult.isError).toBeFalsy();
    const text = getResult.content[0]!.text;
    expect(text).toContain("GROG");
    expect(text).toContain("(shouting)");
    expect(text).toContain("Ook, move!");
    // Order preserved: Character, then Parenthetical, then Dialogue.
    expect(text.indexOf("GROG")).toBeLessThan(text.indexOf("(shouting)"));
    expect(text.indexOf("(shouting)")).toBeLessThan(text.indexOf("Ook, move!"));
  });

  test("create fails for a nonexistent paragraph id", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditDualDialogue({ path, action: "create", ids: ["not-a-real-id"] });
    expect(result.isError).toBe(true);
  });

  test("create requires ids", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditDualDialogue({ path, action: "create", ids: [] });
    expect(result.isError).toBe(true);
  });

  test("get_dual_dialogue errors for a non-wrapper paragraph id", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleGetDualDialogue({ path, id: CHARACTER_ID });
    expect(result.isError).toBe(true);
  });

  test("get_dual_dialogue errors for an unknown id", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleGetDualDialogue({ path, id: "nope" });
    expect(result.isError).toBe(true);
  });

  test("remove with extract=true restores the nested paragraphs to top level", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    await handleEditDualDialogue({ path, action: "create", ids: [CHARACTER_ID, DIALOGUE_ID] });

    const doc = documentCache.get(path)!;
    const wrapper = doc.getParagraphElements().find((p) =>
      p.children.some((c) => c.type === "element" && c.name === "DualDialogue"),
    )!;
    const wrapperId = getParagraphId(wrapper);

    const result = await handleEditDualDialogue({ path, action: "remove", id: wrapperId, extract: true });
    expect(result.isError).toBeFalsy();

    const after = documentCache.get(path)!;
    const ids = after.getParagraphElements().map(getParagraphId);
    expect(ids).toContain(CHARACTER_ID);
    expect(ids).toContain(DIALOGUE_ID);
    expect(ids).not.toContain(wrapperId);
  });

  test("remove without extract deletes the wrapper and its contents", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    await handleEditDualDialogue({ path, action: "create", ids: [CHARACTER_ID, DIALOGUE_ID] });

    const doc = documentCache.get(path)!;
    const wrapper = doc.getParagraphElements().find((p) =>
      p.children.some((c) => c.type === "element" && c.name === "DualDialogue"),
    )!;
    const wrapperId = getParagraphId(wrapper);

    const result = await handleEditDualDialogue({ path, action: "remove", id: wrapperId });
    expect(result.isError).toBeFalsy();

    const after = documentCache.get(path)!;
    const ids = after.getParagraphElements().map(getParagraphId);
    expect(ids).not.toContain(CHARACTER_ID);
    expect(ids).not.toContain(DIALOGUE_ID);
    expect(ids).not.toContain(wrapperId);
  });

  test("remove fails for an unknown wrapper id", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditDualDialogue({ path, action: "remove", id: "nope" });
    expect(result.isError).toBe(true);
  });
});

