// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleEditTitlePage } from "./edit-title-page.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { paragraphText } from "../fdx/paragraph.ts";
import { STANDARD_TITLE_PAGE_LINES } from "../fdx/title-page.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");
const FIXTURE_SOURCE = readFileSync(FIXTURE_PATH, "utf-8");

function freshDoc(key: string): { path: string; doc: FdxDocument } {
  const path = join(import.meta.dir, `edit-title-page-${key}.fdx`);
  const doc = FdxDocument.parse(FIXTURE_SOURCE, path);
  documentCache.set(path, doc);
  return { path, doc };
}

/** A fresh document with no title page at all, for exercising action=create. */
function blankTitlePageDoc(key: string): { path: string; doc: FdxDocument } {
  const { path, doc } = freshDoc(key);
  doc.setTitlePageParagraphs([]);
  return { path, doc };
}

describe("edit_title_page", () => {
  test("rejects a non-.fdx path", async () => {
    const result = await handleEditTitlePage({ path: "script.txt", action: "edit" });
    expect(result.isError).toBe(true);
  });

  test("action is required", async () => {
    const { path } = freshDoc("no-action");
    expect((await handleEditTitlePage({ path })).isError).toBe(true);
  });

  test("create fails when a title page already exists", async () => {
    const { path } = freshDoc("create-exists");
    const result = await handleEditTitlePage({ path, action: "create", title: "X", author: "Y" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("already exists");
  });

  test("create requires title and author", async () => {
    const { path } = blankTitlePageDoc("create-missing-fields");
    const result = await handleEditTitlePage({ path, action: "create", title: "Only Title" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("requires both title and author");
  });

  test("create builds the standard layout and stays at/under the target length", async () => {
    const { path, doc } = blankTitlePageDoc("create-standard");
    const result = await handleEditTitlePage({
      path,
      action: "create",
      title: "MY SCRIPT",
      author: "Jane Doe",
      contactName: "Jane Doe",
      contactAddressLine1: "1 Main St",
      contactCityStateZip: "Town, ST 00000",
      contactPhone: "555-1212",
    });
    expect(result.isError).toBeFalsy();

    const paras = doc.getTitlePageParagraphs();
    expect(paras.length).toBeLessThanOrEqual(STANDARD_TITLE_PAGE_LINES);
    const joined = paras.map(paragraphText).join("\n");
    expect(joined).toContain("MY SCRIPT");
    expect(joined).toContain("Jane Doe");
    expect(joined).toContain("Written by"); // default byLine
    expect(joined).toContain("1 Main St");
    expect(joined).toContain("555-1212");
  });

  test("create without a copyright owner leaves the first two paragraphs blank", async () => {
    const { path, doc } = blankTitlePageDoc("create-no-copyright");
    await handleEditTitlePage({ path, action: "create", title: "MY SCRIPT", author: "Jane Doe" });
    const paras = doc.getTitlePageParagraphs();
    expect(paragraphText(paras[0]!)).toBe("");
    expect(paragraphText(paras[1]!)).toBe("");
  });

  test("create with a copyright owner emits the copyright as the first two paragraphs", async () => {
    const { path, doc } = blankTitlePageDoc("create-with-copyright");
    await handleEditTitlePage({
      path,
      action: "create",
      title: "MY SCRIPT",
      author: "Jane Doe",
      copyrightOwner: "Jane Doe",
      copyrightYear: "2026",
    });
    const paras = doc.getTitlePageParagraphs();
    expect(paragraphText(paras[0]!)).toBe("Copyright © 2026 Jane Doe.");
    expect(paragraphText(paras[1]!)).toBe("All Rights Reserved.");
  });

  test("edit fails when no title page exists", async () => {
    const { path } = blankTitlePageDoc("edit-missing");
    const result = await handleEditTitlePage({ path, action: "edit", title: "X" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("no title page exists");
  });

  test("edit overwrites title/author in place and preserves the contact/based-on blocks", async () => {
    const { path, doc } = freshDoc("edit-inplace");
    const result = await handleEditTitlePage({ path, action: "edit", title: "NEW TITLE", author: "New Author" });
    expect(result.isError).toBeFalsy();

    const joined = doc.getTitlePageParagraphs().map(paragraphText).join("\n");
    expect(joined).toContain("NEW TITLE");
    expect(joined).toContain("New Author");
    // The based-on block ("Star Trek" / "Gene Roddenberry") must survive untouched.
    expect(joined).toContain("Star Trek");
    expect(joined).toContain("Roddenberry");
  });

  test("edit rebuilds the contact block wholesale when any contact field is supplied", async () => {
    const { path, doc } = freshDoc("edit-contact");
    await handleEditTitlePage({
      path,
      action: "edit",
      contactName: "Contact Person",
      contactAddressLine1: "42 Somewhere Ln",
      contactCityStateZip: "City, ST 99999",
      contactPhone: "555-0000",
    });
    const joined = doc.getTitlePageParagraphs().map(paragraphText).join("\n");
    expect(joined).toContain("Contact Person");
    expect(joined).toContain("42 Somewhere Ln");
    expect(joined).toContain("555-0000");
  });

  test("edit with a copyright owner adds the copyright without disturbing the contact block", async () => {
    const { path, doc } = freshDoc("edit-copyright");
    await handleEditTitlePage({
      path,
      action: "edit",
      copyrightOwner: "jane doe",
      copyrightYear: "2026",
    });
    const paras = doc.getTitlePageParagraphs();
    expect(paragraphText(paras[0]!)).toBe("Copyright © 2026 Jane Doe.");
    expect(paragraphText(paras[1]!)).toBe("All Rights Reserved.");
    // Title/author still present.
    const joined = paras.map(paragraphText).join("\n");
    expect(joined).toContain("STAR TREK:  EMPIRES");
  });

  test("remove resets the title page to the blank-document baseline", async () => {
    const { path, doc } = freshDoc("remove");
    const before = doc.getTitlePageParagraphs().map(paragraphText).join("\n");
    expect(before).toContain("STAR TREK:  EMPIRES");

    const result = await handleEditTitlePage({ path, action: "remove" });
    expect(result.isError).toBeFalsy();

    const after = doc.getTitlePageParagraphs();
    expect(after.length).toBeGreaterThan(0);
    const afterText = after.map(paragraphText).join("\n");
    expect(afterText).not.toContain("STAR TREK:  EMPIRES");
  });

  test("remove fails when there is no title page to remove", async () => {
    const { path } = blankTitlePageDoc("remove-missing");
    const result = await handleEditTitlePage({ path, action: "remove" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("no title page to remove");
  });

  test("rejects an unknown action", async () => {
    const { path } = freshDoc("bad-action");
    const result = await handleEditTitlePage({ path, action: "bogus" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("must be 'create', 'edit', or 'remove'");
  });
});

