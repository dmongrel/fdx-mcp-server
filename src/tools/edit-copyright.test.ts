// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleEditCopyright } from "./edit-copyright.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { paragraphText } from "../fdx/paragraph.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");
const FIXTURE_SOURCE = readFileSync(FIXTURE_PATH, "utf-8");

function freshDoc(key: string): { path: string; doc: FdxDocument } {
  const path = join(import.meta.dir, `edit-copyright-${key}.fdx`);
  const doc = FdxDocument.parse(FIXTURE_SOURCE, path);
  documentCache.set(path, doc);
  return { path, doc };
}

describe("edit_copyright", () => {
  test("rejects a non-.fdx path", async () => {
    const result = await handleEditCopyright({ path: "script.txt", action: "set", owner: "Jane" });
    expect(result.isError).toBe(true);
  });

  test("action is required", async () => {
    const { path } = freshDoc("no-action");
    const result = await handleEditCopyright({ path });
    expect(result.isError).toBe(true);
  });

  test("set requires an owner", async () => {
    const { path } = freshDoc("set-no-owner");
    const result = await handleEditCopyright({ path, action: "set" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("requires an owner");
  });

  test("set writes the copyright into the first two title-page paragraphs", async () => {
    const { path, doc } = freshDoc("set-basic");
    const result = await handleEditCopyright({ path, action: "set", owner: "jane doe", year: "2026" });
    expect(result.isError).toBeFalsy();

    const paras = doc.getTitlePageParagraphs();
    expect(paragraphText(paras[0]!)).toBe("Copyright © 2026 Jane Doe.");
    expect(paragraphText(paras[1]!)).toBe("All Rights Reserved.");
  });

  test("allRightsReserved=false omits the second line", async () => {
    const { path, doc } = freshDoc("set-no-arr");
    await handleEditCopyright({ path, action: "set", owner: "Jane Doe", year: "2026", allRightsReserved: false });
    const paras = doc.getTitlePageParagraphs();
    expect(paragraphText(paras[0]!)).toBe("Copyright © 2026 Jane Doe.");
    expect(paragraphText(paras[1]!)).toBe("");
  });

  test("set preserves the rest of the title page (title/author survive)", async () => {
    const { path, doc } = freshDoc("set-preserves");
    await handleEditCopyright({ path, action: "set", owner: "Jane Doe" });
    const joined = doc.getTitlePageParagraphs().map(paragraphText).join("\n");
    expect(joined).toContain("STAR TREK:  EMPIRES");
    expect(joined).toContain("Joel L. Caesar");
  });

  test("remove blanks an existing copyright and reports none-found when already absent", async () => {
    const { path, doc } = freshDoc("remove");
    await handleEditCopyright({ path, action: "set", owner: "Jane Doe" });
    const removeResult = await handleEditCopyright({ path, action: "remove" });
    expect(removeResult.isError).toBeFalsy();
    const paras = doc.getTitlePageParagraphs();
    expect(paragraphText(paras[0]!)).toBe("");
    expect(paragraphText(paras[1]!)).toBe("");

    // The fixture itself never had a copyright, so removing on a fresh copy reports "not found".
    const { path: path2 } = freshDoc("remove-none");
    const result2 = await handleEditCopyright({ path: path2, action: "remove" });
    expect(result2.content[0]!.text).toContain("No copyright statement was found.");
  });

  test("rejects an unknown action", async () => {
    const { path } = freshDoc("bad-action");
    const result = await handleEditCopyright({ path, action: "bogus" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("must be 'set' or 'remove'");
  });
});

