import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleEditPar } from "./edit-par.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { getParagraphId } from "../fdx/paragraph.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");
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

  test("remove requires id and rejects an unknown id", async () => {
    const { path } = freshDoc("remove-missing");
    expect((await handleEditPar({ path, action: "remove" })).isError).toBe(true);
    const result = await handleEditPar({ path, action: "remove", id: "does-not-exist" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
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
});
