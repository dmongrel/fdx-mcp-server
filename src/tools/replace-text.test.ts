// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleReplaceText } from "./replace-text.ts";
import { handleEditPar } from "./edit-par.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, paragraphText } from "../fdx/paragraph.ts";
import { findChildren, textContent } from "../fdx/xml.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");
const FIXTURE_SOURCE = readFileSync(FIXTURE_PATH, "utf-8");

function freshDoc(key: string): { path: string; doc: FdxDocument } {
  const path = join(import.meta.dir, `replace-text-${key}.fdx`);
  const doc = FdxDocument.parse(FIXTURE_SOURCE, path);
  documentCache.set(path, doc);
  return { path, doc };
}

describe("replace_text", () => {
  test("path/find/replace are required", async () => {
    expect((await handleReplaceText({ find: "x", replace: "y" })).isError).toBe(true);
    const { path } = freshDoc("missing-find");
    expect((await handleReplaceText({ path, replace: "y" })).isError).toBe(true);
    expect((await handleReplaceText({ path, find: "x" })).isError).toBe(true);
  });

  test("replaces a single-run match in place and reports the count", async () => {
    const { path, doc } = freshDoc("single-run");
    const target = doc.getParagraphElements().find((p) => paragraphText(p).includes("boulder"))!;
    const id = getParagraphId(target);

    const result = await handleReplaceText({ path, find: "boulder", replace: "rock" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("Replaced 1 occurrence");

    const updated = doc.getParagraphElements().find((p) => getParagraphId(p) === id)!;
    expect(paragraphText(updated)).toContain("rock");
    expect(paragraphText(updated)).not.toContain("boulder");
  });

  test("replaces within a single styled run, leaving that run's other attrs and sibling runs untouched", async () => {
    const { path, doc } = freshDoc("multi-run-attrs");

    await handleEditPar({
      path,
      action: "create",
      type: "Action",
      textRuns: [
        { content: "The " },
        { content: "curly “quote” term", attrs: { AdornmentStyle: "-1", Font: "Courier Final Draft" } },
        { content: " stays put." },
      ],
    });
    const created = doc.getParagraphElements().at(-1)!;
    const id = getParagraphId(created);

    const result = await handleReplaceText({ path, find: "“", replace: '"' });
    expect(result.isError).toBeFalsy();

    const updated = doc.getParagraphElements().find((p) => getParagraphId(p) === id)!;
    const runs = findChildren(updated, "Text");
    expect(runs.length).toBe(3);
    expect(textContent(runs[1]!)).toContain('"quote” term');
    expect(Object.fromEntries(runs[1]!.attrs)).toEqual({ AdornmentStyle: "-1", Font: "Courier Final Draft" });
    expect(textContent(runs[0]!)).toBe("The ");
    expect(textContent(runs[2]!)).toBe(" stays put.");
  });

  test("caseSensitive, parType, and id scoping mirror find_par", async () => {
    const { path, doc } = freshDoc("scoping");
    const dialogue = doc.getParagraphElements().find((p) => paragraphText(p) === "Big food. Grog hungry.")!;
    const dialogueId = getParagraphId(dialogue);

    // caseSensitive: "grog" (lowercase) should not match "Grog" when caseSensitive is true.
    const csResult = await handleReplaceText({
      path,
      find: "grog",
      replace: "GROG",
      parType: "Dialogue",
      caseSensitive: true,
    });
    expect(csResult.content[0]!.text).toContain("Replaced 0 occurrence");

    const ciResult = await handleReplaceText({
      path,
      find: "grog",
      replace: "Zog",
      parType: "Dialogue",
    });
    expect(ciResult.isError).toBeFalsy();
    const updatedDialogue = doc.getParagraphElements().find((p) => getParagraphId(p) === dialogueId)!;
    expect(paragraphText(updatedDialogue)).toContain("Zog");

    const badScope = await handleReplaceText({ path, find: "Zog", replace: "x", id: "does-not-exist" });
    expect(badScope.isError).toBe(true);
    expect(badScope.content[0]!.text).toContain("section id not found");
  });

  test("a match spanning a run boundary is skipped, not merged", async () => {
    const { path, doc } = freshDoc("spanning-match");

    await handleEditPar({
      path,
      action: "create",
      type: "Action",
      textRuns: [{ content: "fo" }, { content: "obar", attrs: { AdornmentStyle: "-1" } }],
    });
    const created = doc.getParagraphElements().at(-1)!;
    const id = getParagraphId(created);
    const runsBefore = findChildren(created, "Text").map((r) => ({
      content: textContent(r),
      attrs: [...r.attrs],
    }));

    const result = await handleReplaceText({ path, find: "foobar", replace: "TARGET" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("Replaced 0 occurrence");
    expect(result.content[0]!.text).toContain("skipped");
    expect(result.content[0]!.text).toContain(id);

    const updated = doc.getParagraphElements().find((p) => getParagraphId(p) === id)!;
    const runsAfter = findChildren(updated, "Text").map((r) => ({
      content: textContent(r),
      attrs: [...r.attrs],
    }));
    expect(runsAfter).toEqual(runsBefore);
  });
});
