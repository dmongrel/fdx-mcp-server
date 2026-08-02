// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { handleRollback } from "./rollback.ts";
import { handleSavepoint } from "./savepoint.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { getParagraphId } from "../fdx/paragraph.ts";

describe("rollback", () => {
  test("path is required", () => {
    expect(handleRollback(undefined).isError).toBe(true);
  });

  test("errors when nothing is cached for path", () => {
    const result = handleRollback({ path: "not-cached.fdx" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("nothing cached for path");
  });

  test("errors when path has no savepoint", () => {
    const path = "rollback-no-savepoint.fdx";
    documentCache.set(path, FdxDocument.parse('<?xml version="1.0"?><FinalDraft Version="6"></FinalDraft>'));
    const result = handleRollback({ path });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("no savepoint set for path");
  });

  test("restores the document to its savepoint", () => {
    const path = "rollback-restores.fdx";
    const doc = FdxDocument.parse(
      '<?xml version="1.0"?><FinalDraft Version="6"><Content><Paragraph Type="Action" id="p1"><Text>original</Text></Paragraph></Content></FinalDraft>',
      path,
    );
    documentCache.set(path, doc);
    handleSavepoint({ path });

    const cached = documentCache.get(path)!;
    cached.getParagraphElements()[0]!.children = [
      { type: "element", name: "Text", attrs: [], children: [{ type: "text", value: "changed" }] },
    ];

    const result = handleRollback({ path });
    expect(result.isError).toBeFalsy();
    const restored = documentCache.get(path)!;
    expect(getParagraphId(restored.getParagraphElements()[0]!)).toBe("p1");
    expect(restored.serialize()).toContain("original");
    expect(restored.serialize()).not.toContain("changed");
  });
});
