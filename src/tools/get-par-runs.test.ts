// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleGetParRuns } from "./get-par-runs.ts";
import { handleEditPar } from "./edit-par.ts";
import { handleEditDualDialogue } from "./edit-dual-dialogue.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { getParagraphId } from "../fdx/paragraph.ts";
import { findContainingSectionIndex } from "../fdx/sections.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");
const FIXTURE_SOURCE = readFileSync(FIXTURE_PATH, "utf-8");

function freshDoc(key: string): { path: string; doc: FdxDocument } {
  const path = join(import.meta.dir, `get-par-runs-${key}.fdx`);
  const doc = FdxDocument.parse(FIXTURE_SOURCE, path);
  documentCache.set(path, doc);
  return { path, doc };
}

describe("get_par_runs", () => {
  test("path is required", async () => {
    const result = await handleGetParRuns({ id: "x" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("path is required");
  });

  test("exactly one of id, ids, or sectionId is required", async () => {
    const { path } = freshDoc("no-selector");
    const result = await handleGetParRuns({ path });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("exactly one of id, ids, or sectionId");
  });

  test("rejects both id and ids given together", async () => {
    const { path, doc } = freshDoc("both-selectors");
    const id = getParagraphId(doc.getParagraphElements()[0]!);
    const result = await handleGetParRuns({ path, id, ids: [id] });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("exactly one of id, ids, or sectionId");
  });

  test("unknown id fails", async () => {
    const { path } = freshDoc("unknown-id");
    const result = await handleGetParRuns({ path, id: "does-not-exist" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("paragraph id not found");
  });

  test("returns a single unstyled run for a plain paragraph", async () => {
    const { path, doc } = freshDoc("plain-run");
    const target = doc.getParagraphElements().find((p) => getParagraphId(p) === "f2a08a18-1655-41ec-8597-c744149ffcee")!;
    const id = getParagraphId(target);

    const result = await handleGetParRuns({ path, id });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);
    expect(body.id).toBe(id);
    expect(body.runs.length).toBe(1);
    expect(body.runs[0].content).toBe(
      "Grog the caveman crouches behind a boulder, eyeing a wooly mammoth grazing in the tall grass.",
    );
    expect(body.runs[0].attrs).toEqual({});
  });

  test("round-trips arbitrary run attrs written by edit_par", async () => {
    const { path } = freshDoc("attrs-roundtrip");

    const createResult = await handleEditPar({
      path,
      action: "create",
      type: "Action",
      textRuns: [
        { content: "The " },
        { content: "Praetorate", attrs: { AdornmentStyle: "-1", Font: "Courier Final Draft" } },
        { content: " has ordered our mission to continue." },
      ],
    });
    expect(createResult.isError).toBeFalsy();

    const doc = documentCache.get(path)!;
    const created = doc.getParagraphElements().at(-1)!;
    const id = getParagraphId(created);

    const result = await handleGetParRuns({ path, id });
    const body = JSON.parse(result.content[0]!.text);
    expect(body.runs.length).toBe(3);
    expect(body.runs[1].content).toBe("Praetorate");
    expect(body.runs[1].attrs).toEqual({ AdornmentStyle: "-1", Font: "Courier Final Draft" });
    expect(body.runs[0].attrs).toEqual({});
  });

  test("ids returns runs for each paragraph in the given order", async () => {
    const { path, doc } = freshDoc("ids-batch");
    const paragraphs = doc.getParagraphElements();
    const firstId = getParagraphId(paragraphs[1]!);
    const secondId = getParagraphId(paragraphs[0]!);

    const result = await handleGetParRuns({ path, ids: [firstId, secondId] });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);
    expect(body.length).toBe(2);
    expect(body[0].id).toBe(firstId);
    expect(body[1].id).toBe(secondId);
    expect(Array.isArray(body[0].runs)).toBe(true);
  });

  test("ids fails the whole call on a missing id", async () => {
    const { path, doc } = freshDoc("ids-missing");
    const id = getParagraphId(doc.getParagraphElements()[0]!);
    const result = await handleGetParRuns({ path, ids: [id, "does-not-exist"] });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("paragraph id not found");
  });

  test("sectionId returns every paragraph in that section, heading included", async () => {
    const { path, doc } = freshDoc("section-batch");
    const sceneHeading = doc.getParagraphElements()[0]!;
    const sceneId = getParagraphId(sceneHeading);

    const result = await handleGetParRuns({ path, sectionId: sceneId });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);
    expect(body[0].id).toBe(sceneId);
    expect(body.length).toBeGreaterThan(1);
  });

  test("sectionId errors on an unknown section id", async () => {
    const { path } = freshDoc("section-unknown");
    const result = await handleGetParRuns({ path, sectionId: "nope" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("section id not found");
  });
});

describe("get_par_runs with nested DualDialogue paragraphs", () => {
  const CHARACTER_ID = "a3049b85-f812-4aaa-9532-9f53f774f758";
  const PARENTHETICAL_ID = "bbee1c41-6ca4-4ae2-bb0e-4c2769f23a16";
  const DIALOGUE_ID = "b5437965-e39f-4236-a0c0-641860dcfb96";

  async function withDualDialogue(key: string) {
    const { path } = freshDoc(key);
    await handleEditDualDialogue({
      path,
      action: "create",
      ids: [CHARACTER_ID, PARENTHETICAL_ID, DIALOGUE_ID],
    });
    return path;
  }

  test("id resolves a nested paragraph instead of failing", async () => {
    const path = await withDualDialogue("nested-id");
    const result = await handleGetParRuns({ path, id: CHARACTER_ID });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);
    expect(body.id).toBe(CHARACTER_ID);
    expect(body.type).toBe("Character");
  });

  test("ids mixing a top-level and a nested id returns both, in order", async () => {
    const path = await withDualDialogue("nested-ids");
    const doc = documentCache.get(path)!;
    const topLevelId = getParagraphId(doc.getParagraphElements()[0]!);
    const result = await handleGetParRuns({ path, ids: [topLevelId, DIALOGUE_ID] });
    expect(result.isError).toBeFalsy();
    const bodies = JSON.parse(result.content[0]!.text);
    expect(bodies.map((b: { id: string }) => b.id)).toEqual([topLevelId, DIALOGUE_ID]);
  });

  test("sectionId spanning a DualDialogue includes its nested paragraphs", async () => {
    const path = await withDualDialogue("nested-section");
    const doc = documentCache.get(path)!;
    const paragraphs = doc.getParagraphElements();
    const wrapperIdx = paragraphs.findIndex((p) =>
      p.children.some((c) => c.type === "element" && c.name === "DualDialogue"),
    );
    const sectionIdx = findContainingSectionIndex(paragraphs, wrapperIdx);
    const sectionId = getParagraphId(paragraphs[sectionIdx]!);
    const result = await handleGetParRuns({ path, sectionId });
    expect(result.isError).toBeFalsy();
    const bodies = JSON.parse(result.content[0]!.text) as Array<{ id: string }>;
    const ids = bodies.map((b) => b.id);
    expect(ids).toContain(CHARACTER_ID);
    expect(ids).toContain(PARENTHETICAL_ID);
    expect(ids).toContain(DIALOGUE_ID);
  });
});
