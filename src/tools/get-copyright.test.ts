// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleGetCopyright } from "./get-copyright.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { setCopyrightBlock } from "../fdx/title-page.ts";
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

  test("reports none found when the fixture has no copyright block", async () => {
    const result = await handleGetCopyright({ path: FIXTURE_PATH });
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
});

