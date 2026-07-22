// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleGetCopyright } from "./get-copyright.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { setCopyrightBlock, setCopyrightStatement, clearCopyrightBlock } from "../fdx/title-page.ts";
import { readFileSync } from "node:fs";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");
const FIXTURE_SOURCE = readFileSync(FIXTURE_PATH, "utf-8");

function allText(result: { content: Array<{ text: string }> }): string {
  return result.content.map((c) => c.text).join("\n");
}

describe("get_copyright", () => {
  test("path is required", async () => {
    expect((await handleGetCopyright(undefined)).isError).toBe(true);
  });

  test("returns the fixture's custom rights statement (Placed into Public Domain.)", async () => {
    const result = await handleGetCopyright({ path: FIXTURE_PATH });
    expect(result.isError).toBeFalsy();
    expect(allText(result)).toContain("Placed into Public Domain.");
  });

  test("reports none found when the copyright/statement region is blank", async () => {
    const path = join(import.meta.dir, "get-copyright-none.fdx");
    const doc = FdxDocument.parse(FIXTURE_SOURCE, path);
    clearCopyrightBlock(doc.getTitlePageParagraphs());
    documentCache.set(path, doc);

    const result = await handleGetCopyright({ path });
    expect(result.isError).toBeFalsy();
    expect(allText(result)).toContain("No copyright statement was found.");
  });

  test("returns the copyright block when present", async () => {
    const path = join(import.meta.dir, "get-copyright-with-block.fdx");
    const doc = FdxDocument.parse(FIXTURE_SOURCE, path);
    doc.setTitlePageParagraphs(setCopyrightBlock(doc.getTitlePageParagraphs(), "jane doe", "2026", true));
    documentCache.set(path, doc);

    const result = await handleGetCopyright({ path });
    expect(result.isError).toBeFalsy();
    const text = allText(result);
    expect(text).toContain("Copyright © 2026 Jane Doe.");
    expect(text).toContain("All Rights Reserved.");
  });

  test("returns a custom statement set via setCopyrightStatement", async () => {
    const path = join(import.meta.dir, "get-copyright-statement.fdx");
    const doc = FdxDocument.parse(FIXTURE_SOURCE, path);
    doc.setTitlePageParagraphs(setCopyrightStatement(doc.getTitlePageParagraphs(), "Placed into Public Domain."));
    documentCache.set(path, doc);

    const result = await handleGetCopyright({ path });
    expect(result.isError).toBeFalsy();
    expect(allText(result)).toBe("Placed into Public Domain.");
  });
});

