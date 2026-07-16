import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleEditHeaderAndFooter } from "./edit-header-and-footer.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { renderHeaderAndFooter, titlePageHfExists } from "../fdx/header-footer.ts";
import { getAttr } from "../fdx/xml.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");
const FIXTURE_SOURCE = readFileSync(FIXTURE_PATH, "utf-8");

function freshDoc(key: string): { path: string; doc: FdxDocument } {
  const path = join(import.meta.dir, `edit-hf-${key}.fdx`);
  const doc = FdxDocument.parse(FIXTURE_SOURCE, path);
  documentCache.set(path, doc);
  return { path, doc };
}

describe("edit_header_and_footer", () => {
  test("rejects a non-.fdx path", async () => {
    const result = await handleEditHeaderAndFooter({ path: "script.txt", action: "edit" });
    expect(result.isError).toBe(true);
  });

  test("edit rebuilds the body header wholesale and applies attributes", async () => {
    const { path, doc } = freshDoc("edit-body-header");
    const result = await handleEditHeaderAndFooter({
      path,
      action: "edit",
      location: "body",
      headerParts: [{ text: "MY SCRIPT - " }, { label: "Page #" }],
      headerVisible: "No",
    });
    expect(result.isError).toBeFalsy();

    const hf = doc.getBodyHeaderAndFooterElement()!;
    const out = renderHeaderAndFooter(hf, "all");
    expect(out.indexOf("MY SCRIPT - ")).toBeGreaterThanOrEqual(0);
    expect(out.indexOf("[Page #]")).toBeGreaterThan(out.indexOf("MY SCRIPT - "));
    expect(out).not.toContain("EMPIRES");
    expect(getAttr(hf, "HeaderVisible")).toBe("No");
  });

  test("rejects an unknown dynamic label", async () => {
    const { path } = freshDoc("bad-label");
    const result = await handleEditHeaderAndFooter({
      path,
      action: "edit",
      location: "body",
      headerParts: [{ label: "Bogus" }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("invalid dynamic label");
  });

  test("rejects a part with both text and label, or neither", async () => {
    const { path } = freshDoc("bad-part-shape");
    const both = await handleEditHeaderAndFooter({
      path,
      action: "edit",
      headerParts: [{ text: "x", label: "Date" }],
    });
    expect(both.isError).toBe(true);
    const neither = await handleEditHeaderAndFooter({ path, action: "edit", headerParts: [{}] });
    expect(neither.isError).toBe(true);
  });

  test("create is rejected when a body HeaderAndFooter already exists", async () => {
    const { path } = freshDoc("create-exists");
    const result = await handleEditHeaderAndFooter({
      path,
      action: "create",
      location: "body",
      headerParts: [{ text: "X" }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("already exists");
  });

  test("create builds a fresh title page HeaderAndFooter with defaults applied", async () => {
    const { path, doc } = freshDoc("create-titlepage");
    // The fixture already has a title-page HeaderAndFooter, so clear it first to exercise create.
    doc.setTitlePageHeaderAndFooterElement({ type: "element", name: "HeaderAndFooter", attrs: [], children: [] });

    const result = await handleEditHeaderAndFooter({
      path,
      action: "create",
      location: "titlePage",
      headerParts: [{ text: "DRAFT " }, { label: "Date" }],
      footerParts: [{ label: "Page #" }],
    });
    expect(result.isError).toBeFalsy();

    const hf = doc.getTitlePageHeaderAndFooterElement()!;
    expect(titlePageHfExists(hf)).toBe(true);
    const out = renderHeaderAndFooter(hf, "all");
    expect(out).toContain("DRAFT ");
    expect(out).toContain("[Date]");
    expect(out).toContain("[Page #]");
    expect(getAttr(hf, "StartingPage")).toBe("1");
  });

  test("remove resets the body HeaderAndFooter to the blank-document baseline", async () => {
    const { path, doc } = freshDoc("remove-body");
    const before = renderHeaderAndFooter(doc.getBodyHeaderAndFooterElement()!, "all");
    expect(before).toContain("EMPIRES");

    const result = await handleEditHeaderAndFooter({ path, action: "remove", location: "body" });
    expect(result.isError).toBeFalsy();

    const after = renderHeaderAndFooter(doc.getBodyHeaderAndFooterElement()!, "all");
    expect(after).not.toContain("EMPIRES");
  });

  test("remove resets the title page HeaderAndFooter to the blank-document baseline", async () => {
    const { path, doc } = freshDoc("remove-titlepage");
    expect(titlePageHfExists(doc.getTitlePageHeaderAndFooterElement())).toBe(true);

    const result = await handleEditHeaderAndFooter({ path, action: "remove", location: "titlePage" });
    expect(result.isError).toBeFalsy();
    expect(titlePageHfExists(doc.getTitlePageHeaderAndFooterElement())).toBe(true); // baseline still carries one
  });

  test("rejects an unknown action", async () => {
    const { path } = freshDoc("bad-action");
    const result = await handleEditHeaderAndFooter({ path, action: "bogus" });
    expect(result.isError).toBe(true);
  });

  test("rejects an unknown location", async () => {
    const { path } = freshDoc("bad-location");
    const result = await handleEditHeaderAndFooter({ path, action: "edit", location: "bogus" });
    expect(result.isError).toBe(true);
  });
});
