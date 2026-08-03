// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleEditPar } from "./edit-par.ts";
import { handleEditDualDialogue } from "./edit-dual-dialogue.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { getParagraphId } from "../fdx/paragraph.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");
const FIXTURE_SOURCE = readFileSync(FIXTURE_PATH, "utf-8");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Loads a fresh copy of the fixture under a unique cache key so tests don't interfere. */
function freshDoc(key: string): { path: string; doc: FdxDocument } {
  const path = join(import.meta.dir, `edit-par-${key}.fdx`);
  const doc = FdxDocument.parse(FIXTURE_SOURCE, path);
  documentCache.set(path, doc);
  return { path, doc };
}

describe("edit_par", () => {
  test("rejects a non-.fdx path", async () => {
    const result = await handleEditPar({ path: "script.txt", action: "create", type: "Action" });
    expect(result.isError).toBe(true);
  });

  test("rejects an invalid paragraph type on create", async () => {
    const { path } = freshDoc("invalid-type");
    const result = await handleEditPar({ path, action: "create", type: "Bogus Type" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("invalid paragraph type");
  });

  test("create appends a new paragraph with a fresh, unique UUID", async () => {
    const { path, doc } = freshDoc("create-append");
    const before = doc.getParagraphElements().length;
    const beforeIds = new Set(doc.getParagraphElements().map(getParagraphId));

    const result = await handleEditPar({
      path,
      action: "create",
      type: "Action",
      textRuns: [{ content: "first" }],
    });
    expect(result.isError).toBeFalsy();

    const after = doc.getParagraphElements();
    expect(after.length).toBe(before + 1);
    const created = after[after.length - 1]!;
    expect(getParagraphId(created)).toMatch(UUID_RE);
    expect(beforeIds.has(getParagraphId(created))).toBe(false);

    // A second create must not repeat the first id.
    await handleEditPar({ path, action: "create", type: "Action", textRuns: [{ content: "second" }] });
    const after2 = doc.getParagraphElements();
    const secondId = getParagraphId(after2[after2.length - 1]!);
    expect(secondId).not.toBe(getParagraphId(created));
  });

  test("create returns the new paragraph's id and type as JSON", async () => {
    const { path, doc } = freshDoc("create-returns-id");

    const result = await handleEditPar({
      path,
      action: "create",
      type: "Action",
      textRuns: [{ content: "a fresh paragraph" }],
    });
    expect(result.isError).toBeFalsy();

    const body = JSON.parse(result.content[result.content.length - 1]!.text);
    expect(body.type).toBe("Action");
    expect(body.id).toMatch(UUID_RE);

    const created = doc.getParagraphElements().find((p) => getParagraphId(p) === body.id);
    expect(created).toBeDefined();
  });

  test("create with beforeParId inserts immediately before the anchor", async () => {
    const { path, doc } = freshDoc("create-before");
    const anchor = doc.getParagraphElements()[2]!;
    const anchorId = getParagraphId(anchor);

    await handleEditPar({
      path,
      action: "create",
      type: "Action",
      beforeParId: anchorId,
      textRuns: [{ content: "inserted-before" }],
    });

    const paragraphs = doc.getParagraphElements();
    const idx = paragraphs.findIndex((p) => getParagraphId(p) === anchorId);
    expect(idx).toBeGreaterThan(0);
    const prev = paragraphs[idx - 1]!;
    expect(prev.attrs.find(([k]) => k === "Type")?.[1]).toBe("Action");
  });

  test("create with afterParId inserts immediately after the anchor", async () => {
    const { path, doc } = freshDoc("create-after");
    const anchor = doc.getParagraphElements()[2]!;
    const anchorId = getParagraphId(anchor);

    await handleEditPar({
      path,
      action: "create",
      type: "Action",
      afterParId: anchorId,
      textRuns: [{ content: "inserted-after" }],
    });

    const paragraphs = doc.getParagraphElements();
    const idx = paragraphs.findIndex((p) => getParagraphId(p) === anchorId);
    const next = paragraphs[idx + 1]!;
    expect(next.attrs.find(([k]) => k === "Type")?.[1]).toBe("Action");
  });

  test("create with an unknown anchor id fails", async () => {
    const { path } = freshDoc("create-bad-anchor");
    const result = await handleEditPar({
      path,
      action: "create",
      type: "Action",
      beforeParId: "does-not-exist",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("anchor paragraph not found");
  });

  test("edit updates type, alignment, and text of an existing paragraph", async () => {
    const { path, doc } = freshDoc("edit-existing");
    const target = doc.getParagraphElements()[0]!;
    const id = getParagraphId(target);

    const result = await handleEditPar({
      path,
      action: "edit",
      id,
      type: "Action",
      alignment: "Center",
      textRuns: [{ content: "edited text" }],
    });
    expect(result.isError).toBeFalsy();

    const updated = doc.getParagraphElements().find((p) => getParagraphId(p) === id)!;
    expect(updated.attrs.find(([k]) => k === "Type")?.[1]).toBe("Action");
    expect(updated.attrs.find(([k]) => k === "Alignment")?.[1]).toBe("Center");
  });

  test("edit preserves and round-trips arbitrary textRuns attrs", async () => {
    const { path, doc } = freshDoc("edit-attrs-roundtrip");
    const target = doc.getParagraphElements()[0]!;
    const id = getParagraphId(target);

    const result = await handleEditPar({
      path,
      action: "edit",
      id,
      type: "Action",
      textRuns: [
        { content: "The " },
        { content: "Shur", attrs: { AdornmentStyle: "-1" } },
        { content: " remainder" },
      ],
    });
    expect(result.isError).toBeFalsy();

    const updated = doc.getParagraphElements().find((p) => getParagraphId(p) === id)!;
    const textRuns = updated.children.filter((c) => c.type === "element" && c.name === "Text") as Array<
      { attrs: Array<[string, string]> }
    >;
    expect(textRuns.length).toBe(3);
    expect(Object.fromEntries(textRuns[1]!.attrs)).toEqual({ AdornmentStyle: "-1" });
    expect(textRuns[0]!.attrs).toEqual([]);
  });

  test("edit with no type keeps the paragraph's existing type", async () => {
    const { path, doc } = freshDoc("edit-default-type");
    const target = doc.getParagraphElements()[0]!;
    const id = getParagraphId(target);
    const originalType = target.attrs.find(([k]) => k === "Type")?.[1];

    const result = await handleEditPar({
      path,
      action: "edit",
      id,
      textRuns: [{ content: "edited without a type" }],
    });
    expect(result.isError).toBeFalsy();

    const updated = doc.getParagraphElements().find((p) => getParagraphId(p) === id)!;
    expect(updated.attrs.find(([k]) => k === "Type")?.[1]).toBe(originalType);
  });

  test("edit with an explicit invalid type still fails", async () => {
    const { path, doc } = freshDoc("edit-invalid-type");
    const target = doc.getParagraphElements()[0]!;
    const id = getParagraphId(target);

    const result = await handleEditPar({ path, action: "edit", id, type: "Bogus Type" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("invalid paragraph type");
  });

  test("edit requires id", async () => {
    const { path } = freshDoc("edit-no-id");
    const result = await handleEditPar({ path, action: "edit", type: "Action" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("id is required");
  });

  test("edit of an unknown id fails", async () => {
    const { path } = freshDoc("edit-unknown-id");
    const result = await handleEditPar({ path, action: "edit", id: "nope", type: "Action" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
  });

  test("remove deletes the paragraph and only that paragraph", async () => {
    const { path, doc } = freshDoc("remove-existing");
    const before = doc.getParagraphElements();
    const target = before[1]!;
    const id = getParagraphId(target);

    const result = await handleEditPar({ path, action: "remove", id });
    expect(result.isError).toBeFalsy();

    const after = doc.getParagraphElements();
    expect(after.length).toBe(before.length - 1);
    expect(after.some((p) => getParagraphId(p) === id)).toBe(false);
  });

  test("remove reports the removed paragraph's type", async () => {
    const { path, doc } = freshDoc("remove-reports-type");
    const target = doc.getParagraphElements()[1]!;
    const id = getParagraphId(target);
    const type = target.attrs.find(([k]) => k === "Type")?.[1];

    const result = await handleEditPar({ path, action: "remove", id });
    expect(result.isError).toBeFalsy();
    expect(result.content.map((c) => c.text).join("\n")).toContain(`(${type})`);
  });

  test("remove refuses a dual-dialogue wrapper paragraph, cascading nothing", async () => {
    const { path, doc } = freshDoc("remove-dual-dialogue-wrapper");
    const content = doc.getContentElement(true)!;
    const before = doc.getParagraphElements().length;
    const wrapperId = "dd-wrapper-1";

    content.children.push({
      type: "element",
      name: "Paragraph",
      attrs: [["Type", "General"], ["id", wrapperId]],
      children: [
        {
          type: "element",
          name: "DualDialogue",
          attrs: [],
          children: [
            { type: "element", name: "Paragraph", attrs: [["Type", "Character"], ["id", "dd-char-1"]], children: [] },
            { type: "element", name: "Paragraph", attrs: [["Type", "Dialogue"], ["id", "dd-dial-1"]], children: [] },
          ],
        },
      ],
    });

    const result = await handleEditPar({ path, action: "remove", id: wrapperId });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("dual-dialogue wrapper");
    expect(result.content[0]!.text).toContain("edit_dual_dialogue");
    // Nothing was removed — the wrapper and its two nested paragraphs are all still present.
    expect(doc.getParagraphElements().length).toBe(before + 1);
  });

  test("remove requires id and rejects an unknown id", async () => {
    const { path } = freshDoc("remove-missing");
    expect((await handleEditPar({ path, action: "remove" })).isError).toBe(true);
    const result = await handleEditPar({ path, action: "remove", id: "does-not-exist" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
  });

  test("edit warns when the id is duplicated, and still edits the first match", async () => {
    const { path, doc } = freshDoc("edit-duplicate-id");
    const paragraphs = doc.getParagraphElements();
    const id = getParagraphId(paragraphs[0]!);
    doc.getContentElement(true)!.children.push(
      // Duplicate id on a second paragraph, mirroring FinalDraft's copy/paste bug.
      { type: "element", name: "Paragraph", attrs: [["Type", "Action"], ["id", id]], children: [{ type: "text", value: "" }] },
    );

    const result = await handleEditPar({ path, action: "edit", id, type: "Action", textRuns: [{ content: "edited" }] });
    expect(result.isError).toBeFalsy();
    expect(result.content.map((c) => c.text).join("\n")).toContain("this id matches 2 paragraphs");
  });

  test("remove warns when the id is duplicated, and only removes the first match", async () => {
    const { path, doc } = freshDoc("remove-duplicate-id");
    const paragraphs = doc.getParagraphElements();
    const id = getParagraphId(paragraphs[0]!);
    const before = doc.getParagraphElements().length;
    doc.getContentElement(true)!.children.push(
      { type: "element", name: "Paragraph", attrs: [["Type", "Action"], ["id", id]], children: [{ type: "text", value: "" }] },
    );

    const result = await handleEditPar({ path, action: "remove", id });
    expect(result.isError).toBeFalsy();
    expect(result.content.map((c) => c.text).join("\n")).toContain("this id matches 2 paragraphs");
    // One of the two duplicate-id paragraphs remains (the second one, never removed).
    expect(doc.getParagraphElements().length).toBe(before);
  });

  test("unknown action does not mutate the document", async () => {
    const { path, doc } = freshDoc("bogus-action");
    const before = doc.getParagraphElements().length;
    const result = await handleEditPar({ path, action: "bogus", type: "Action" });
    expect(result.isError).toBe(true);
    expect(doc.getParagraphElements().length).toBe(before);
  });

  test("creating a Character paragraph adds its text to the Characters SmartType list", async () => {
    const { path, doc } = freshDoc("smarttype-character");
    await handleEditPar({
      path,
      action: "create",
      type: "Character",
      textRuns: [{ content: "ZZZ NEW SPEAKER" }],
    });
    const list = doc.getSmartTypeList("Character")!;
    expect(list.values).toContain("ZZZ NEW SPEAKER");
  });

  test("creating a Scene Heading paragraph updates SceneIntros/Locations/TimesOfDay", async () => {
    const { path, doc } = freshDoc("smarttype-scene-heading");
    await handleEditPar({
      path,
      action: "create",
      type: "Scene Heading",
      textRuns: [{ content: "INT. ZZZ TEST BRIDGE - DAY" }],
    });
    const intros = doc.getSmartTypeList("SceneIntro")!;
    const locations = doc.getSmartTypeList("Location")!;
    expect(intros.values).toContain("INT");
    expect(locations.values.some((v) => v.includes("ZZZ TEST BRIDGE"))).toBe(true);
  });

  test("create with color sets SceneProperties.Color on the new paragraph", async () => {
    const { path, doc } = freshDoc("create-with-color");
    const result = await handleEditPar({
      path,
      action: "create",
      type: "Scene Heading",
      color: "#6363A7A7EFEF",
      textRuns: [{ content: "INT. ZZZ TEST BRIDGE - DAY" }],
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);

    const created = doc.getParagraphElements().find((p) => getParagraphId(p) === body.id)!;
    const sp = created.children.find((c) => c.type === "element" && c.name === "SceneProperties") as
      | { attrs: Array<[string, string]> }
      | undefined;
    expect(sp).toBeDefined();
    expect(sp!.attrs).toContainEqual(["Color", "#6363A7A7EFEF"]);
  });

  test("create without color behaves exactly as before — no SceneProperties created", async () => {
    const { path, doc } = freshDoc("create-without-color");
    const result = await handleEditPar({
      path,
      action: "create",
      type: "Action",
      textRuns: [{ content: "Grog stands up." }],
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);

    const created = doc.getParagraphElements().find((p) => getParagraphId(p) === body.id)!;
    const sp = created.children.find((c) => c.type === "element" && c.name === "SceneProperties");
    expect(sp).toBeUndefined();
  });
});

describe("edit_par with nested DualDialogue paragraphs", () => {
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

  test("action=edit changes a nested paragraph's text, persisted in the tree", async () => {
    const path = await withDualDialogue("nested-edit");
    const result = await handleEditPar({
      path,
      action: "edit",
      id: DIALOGUE_ID,
      textRuns: [{ content: "Move it now!" }],
    });
    expect(result.isError).toBeFalsy();

    const doc = documentCache.get(path)!;
    const wrapper = doc
      .getParagraphElements()
      .find((p) => p.children.some((c) => c.type === "element" && c.name === "DualDialogue"))!;
    const dd = wrapper.children.find((c) => c.type === "element" && c.name === "DualDialogue") as {
      children: Array<{ attrs: Array<[string, string]>; children: Array<{ type: string; children?: Array<{ value?: string }> }> }>;
    };
    const nestedDialogue = dd.children.find((p) => p.attrs.some(([k, v]) => k === "id" && v === DIALOGUE_ID))!;
    const textEl = nestedDialogue.children.find((c) => c.type === "element")!;
    expect(textEl.children![0]!.value).toBe("Move it now!");
  });

  test("action=create with beforeParId pointing at a nested id still fails (anchor lookup stays top-level-only)", async () => {
    const path = await withDualDialogue("nested-create-anchor");
    const result = await handleEditPar({
      path,
      action: "create",
      type: "Action",
      beforeParId: DIALOGUE_ID,
      textRuns: [{ content: "New action line." }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("anchor paragraph not found");
  });

  test("action=remove on a nested id still fails (removal stays top-level-only)", async () => {
    const path = await withDualDialogue("nested-remove");
    const result = await handleEditPar({ path, action: "remove", id: DIALOGUE_ID });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("paragraph not found");
  });
});

