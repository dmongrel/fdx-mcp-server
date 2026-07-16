import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleEditElementSettings } from "./edit-element-settings.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { getAttr, findChild } from "../fdx/xml.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");
const FIXTURE_SOURCE = readFileSync(FIXTURE_PATH, "utf-8");

function freshDoc(key: string): { path: string; doc: FdxDocument } {
  const path = join(import.meta.dir, `edit-element-settings-${key}.fdx`);
  const doc = FdxDocument.parse(FIXTURE_SOURCE, path);
  documentCache.set(path, doc);
  return { path, doc };
}

describe("edit_element_settings", () => {
  test("rejects a non-.fdx path", async () => {
    const result = await handleEditElementSettings({ path: "script.txt", action: "create", type: "Book Part" });
    expect(result.isError).toBe(true);
  });

  test("rejects an invalid element settings type", async () => {
    const { path } = freshDoc("invalid-type");
    const result = await handleEditElementSettings({ path, action: "create", type: "Bogus Type" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("invalid element settings type");
  });

  test("create adds a new record with ParagraphSpec.Type mirroring the element type", async () => {
    const { path, doc } = freshDoc("create-new");
    expect(doc.findElementSettingsElement("Book Part")).toBeUndefined();

    const result = await handleEditElementSettings({
      path,
      action: "create",
      type: "Book Part",
      font: "Courier Final Draft",
      fontSize: "12",
      alignment: "Center",
    });
    expect(result.isError).toBeFalsy();

    const es = doc.findElementSettingsElement("Book Part")!;
    expect(es).toBeDefined();
    const paragraphSpec = findChild(es, "ParagraphSpec")!;
    expect(getAttr(paragraphSpec, "Type")).toBe("Book Part");
    expect(getAttr(paragraphSpec, "Alignment")).toBe("Center");
    const fontSpec = findChild(es, "FontSpec")!;
    expect(getAttr(fontSpec, "Font")).toBe("Courier Final Draft");
  });

  test("create is rejected when the type already exists", async () => {
    const { path } = freshDoc("create-exists");
    const result = await handleEditElementSettings({ path, action: "create", type: "Scene Heading" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("already exists");
  });

  test("edit changes only supplied fields, preserving the rest", async () => {
    const { path, doc } = freshDoc("edit-existing");
    const before = doc.findElementSettingsElement("Scene Heading")!;
    const beforeFont = getAttr(findChild(before, "FontSpec")!, "Font");

    const result = await handleEditElementSettings({ path, action: "edit", type: "Scene Heading", spaceBefore: "24" });
    expect(result.isError).toBeFalsy();

    const after = doc.findElementSettingsElement("Scene Heading")!;
    expect(getAttr(findChild(after, "ParagraphSpec")!, "SpaceBefore")).toBe("24");
    expect(getAttr(findChild(after, "FontSpec")!, "Font")).toBe(beforeFont);
    expect(getAttr(findChild(after, "ParagraphSpec")!, "Type")).toBe("Scene Heading");
  });

  test("edit is rejected when the type is absent", async () => {
    const { path } = freshDoc("edit-absent");
    const result = await handleEditElementSettings({ path, action: "edit", type: "Book Part" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("no element settings");
  });

  test("remove deletes the record", async () => {
    const { path, doc } = freshDoc("remove-existing");
    expect(doc.findElementSettingsElement("Scene Heading")).toBeDefined();
    const result = await handleEditElementSettings({ path, action: "remove", type: "Scene Heading" });
    expect(result.isError).toBeFalsy();
    expect(doc.findElementSettingsElement("Scene Heading")).toBeUndefined();
  });

  test("remove is rejected when the type is absent", async () => {
    const { path } = freshDoc("remove-absent");
    const result = await handleEditElementSettings({ path, action: "remove", type: "Book Part" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("no element settings");
  });

  test("rejects an unknown action", async () => {
    const { path } = freshDoc("bad-action");
    const result = await handleEditElementSettings({ path, action: "bogus", type: "Scene Heading" });
    expect(result.isError).toBe(true);
  });
});
