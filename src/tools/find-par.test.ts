// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { handleFindPar } from "./find-par.ts";
import { handleEditDualDialogue } from "./edit-dual-dialogue.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");
const FIXTURE_SOURCE = readFileSync(FIXTURE_PATH, "utf-8");

/** Loads a fresh copy of the fixture under a unique cache key so tests don't interfere. */
function freshDoc(key: string): { path: string; doc: FdxDocument } {
  const path = join(import.meta.dir, `find-par-${key}.fdx`);
  const doc = FdxDocument.parse(FIXTURE_SOURCE, path);
  documentCache.set(path, doc);
  return { path, doc };
}

/** Parses the last content block as JSON (the main block; earlier blocks may be cache warnings). */
function hits(result: { content: Array<{ text: string }> }): Array<Record<string, unknown>> {
  return JSON.parse(result.content[result.content.length - 1]!.text);
}

describe("find_par", () => {
  test("path and textContent are required", async () => {
    expect((await handleFindPar({ textContent: "x" })).isError).toBe(true);
    expect((await handleFindPar({ path: FIXTURE_PATH })).isError).toBe(true);
  });

  test("finds a paragraph containing the query, case-insensitively by default", async () => {
    const { path } = freshDoc("basic-match");
    const result = await handleFindPar({ path, textContent: "wooly mammoth grazing" });
    expect(result.isError).toBeFalsy();
    const found = hits(result);
    expect(found.length).toBe(1);
    expect(found[0]!.text).toContain("wooly mammoth grazing");
    expect(found[0]!.type).toBe("Action");
  });

  test("case-sensitive search misses a differently-cased query", async () => {
    const { path } = freshDoc("case-sensitive-miss");
    const result = await handleFindPar({
      path,
      textContent: "WOOLY MAMMOTH GRAZING",
      caseSensitive: true,
    });
    expect(hits(result)).toEqual([]);
  });

  test("filters by paragraph type", async () => {
    const { path } = freshDoc("filter-by-type");
    const result = await handleFindPar({ path, textContent: "OOK", parType: "Character" });
    expect(result.isError).toBeFalsy();
    for (const hit of hits(result)) {
      expect(hit.type).toBe("Character");
    }
  });

  test("no match returns an empty array", async () => {
    const { path } = freshDoc("no-match");
    const result = await handleFindPar({ path, textContent: "zzz_no_such_text_zzz" });
    expect(hits(result)).toEqual([]);
  });

  test("unknown scene id errors", async () => {
    const { path } = freshDoc("bad-scene-id");
    const result = await handleFindPar({ path, textContent: "Romulan", id: "not-a-scene" });
    expect(result.isError).toBe(true);
  });

  test("a hit inside a scene reports sceneId and sceneHeading", async () => {
    const { path, doc } = freshDoc("scene-enrichment");
    const scene = doc.getParagraphElements()[0]!; // "EXT. PREHISTORIC VALLEY - DAY"
    const sceneId = scene.attrs.find(([k]) => k === "id")?.[1];

    const result = await handleFindPar({ path, textContent: "wooly mammoth grazing" });
    const [hit] = hits(result);
    expect(hit!.sceneId).toBe(sceneId);
    expect(hit!.sceneHeading).toBe("EXT. PREHISTORIC VALLEY - DAY");
  });

  test("page is null when the containing scene has no SceneProperties.Page", async () => {
    const { path } = freshDoc("no-page");
    const result = await handleFindPar({ path, textContent: "wooly mammoth grazing" });
    const [hit] = hits(result);
    expect(hit!.page).toBeNull();
  });

  test("a hit before any section heading gets null scene fields", async () => {
    const { path, doc } = freshDoc("no-containing-scene");
    const content = doc.getContentElement(true)!;
    content.children.unshift({
      type: "element",
      name: "Paragraph",
      attrs: [["Type", "Action"], ["id", "preamble-1"]],
      children: [{ type: "element", name: "Text", attrs: [], children: [{ type: "text", value: "A lone preamble line." }] }],
    });

    const result = await handleFindPar({ path, textContent: "lone preamble" });
    const [hit] = hits(result);
    expect(hit!.sceneId).toBeNull();
    expect(hit!.sceneHeading).toBeNull();
    expect(hit!.page).toBeNull();
  });
});

describe("find_par with a DualDialogue in the document", () => {
  const CHARACTER_ID = "a3049b85-f812-4aaa-9532-9f53f774f758";
  const PARENTHETICAL_ID = "bbee1c41-6ca4-4ae2-bb0e-4c2769f23a16";
  const DIALOGUE_ID = "b5437965-e39f-4236-a0c0-641860dcfb96";
  const FIRST_SCENE_ID = "6e39d99f-6972-42f8-bdc8-3f0dbe546280";

  async function withDualDialogue(key: string) {
    const { path } = freshDoc(key);
    await handleEditDualDialogue({
      path,
      action: "create",
      ids: [CHARACTER_ID, PARENTHETICAL_ID, DIALOGUE_ID],
    });
    return path;
  }

  test("whole-document search reports the skipped-nested count", async () => {
    const path = await withDualDialogue("skip-warning");
    const result = await handleFindPar({ path, textContent: "does not matter" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain(
      "3 paragraph(s) nested inside a DualDialogue block were not scanned by this call.",
    );
  });

  test("a scene-scoped search that does not include the DualDialogue reports no skip", async () => {
    const path = await withDualDialogue("skip-scoped-out");
    const result = await handleFindPar({ path, textContent: "does not matter", id: FIRST_SCENE_ID });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).not.toContain("nested inside a DualDialogue");
  });

  test("no DualDialogue in scope means no warning", async () => {
    const { path } = freshDoc("no-dual-dialogue");
    const result = await handleFindPar({ path, textContent: "does not matter" });
    expect(result.content[0]!.text).not.toContain("nested inside a DualDialogue");
  });
});
