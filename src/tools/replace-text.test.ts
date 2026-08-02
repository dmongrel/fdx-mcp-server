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
import { findChild, findChildren, getAttr, setAttr, textContent } from "../fdx/xml.ts";

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

  test("hazard: never touches <Actors> WinVoice, even when its content matches find", async () => {
    const { path, doc } = freshDoc("winvoice-hazard");

    // Actors/WinVoice can hold arbitrary binary-derived characters, including a curly quote —
    // exactly the kind of content a "normalize smart quotes" replace_text call would target.
    const winVoiceBlob = "‘Q|Çg(Ð„{DEST";
    const actors = findChild(doc.root, "Actors")!;
    const actor = findChildren(actors, "Actor")[0]!;
    setAttr(actor, "WinVoice", winVoiceBlob);

    const result = await handleReplaceText({ path, find: "‘", replace: '"' });
    expect(result.isError).toBeFalsy();
    // The fixture has no curly quotes in <Text> content, so nothing should match at all —
    // replace_text only ever walks <Content>'s paragraphs, never the sibling <Actors> block.
    expect(result.content[0]!.text).toContain("Replaced 0 occurrence");

    const actorAfter = findChildren(findChild(doc.root, "Actors")!, "Actor")[0]!;
    expect(getAttr(actorAfter, "WinVoice")).toBe(winVoiceBlob);
    expect(doc.serialize()).toContain(`WinVoice="${winVoiceBlob}"`);
  });

  test("preview reports matches without mutating the document", async () => {
    const { path, doc } = freshDoc("preview-basic");
    const target = doc.getParagraphElements().find((p) => paragraphText(p).includes("boulder"))!;
    const id = getParagraphId(target);

    const result = await handleReplaceText({ path, find: "boulder", replace: "rock", preview: true });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[result.content.length - 1]!.text);
    expect(body.preview).toBe(true);
    expect(body.totalMatches).toBe(1);
    expect(body.totalSkipped).toBe(0);
    const match = body.matches.find((m: { id: string }) => m.id === id);
    expect(match).toBeDefined();
    expect(match.wouldReplace).toBe(1);
    expect(match.skipped).toBe(0);
    expect(match.text).toContain("«boulder»");

    // Nothing changed.
    const stillThere = doc.getParagraphElements().find((p) => getParagraphId(p) === id)!;
    expect(paragraphText(stillThere)).toContain("boulder");
    expect(paragraphText(stillThere)).not.toContain("rock");
  });

  test("preview marks a case-insensitive match with its original document casing", async () => {
    const { path } = freshDoc("preview-casing");
    const result = await handleReplaceText({ path, find: "grog", replace: "ZOG", parType: "Character", preview: true });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);
    const match = body.matches.find((m: { text: string }) => m.text.includes("«Grog»") || m.text.includes("«GROG»"));
    expect(match).toBeDefined();
    // The find term itself ("grog", lowercase) must not appear verbatim inside the marker.
    expect(match.text).not.toContain("«grog»");
  });

  test("preview marks every occurrence in a paragraph with multiple matches", async () => {
    const { path, doc } = freshDoc("preview-multi");
    await handleEditPar({
      path,
      action: "create",
      type: "Action",
      textRuns: [{ content: "Grog sees Grog's reflection and greets Grog." }],
    });
    const created = doc.getParagraphElements().at(-1)!;
    const id = getParagraphId(created);

    const result = await handleReplaceText({ path, find: "Grog", replace: "Zog", preview: true });
    const body = JSON.parse(result.content[0]!.text);
    const match = body.matches.find((m: { id: string }) => m.id === id);
    expect(match.wouldReplace).toBe(3);
    expect((match.text.match(/«Grog»/g) ?? []).length).toBe(3);
  });

  test("preview surfaces a run-spanning match as skip-only, not silently omitted", async () => {
    const { path, doc } = freshDoc("preview-spanning");
    await handleEditPar({
      path,
      action: "create",
      type: "Action",
      textRuns: [{ content: "fo" }, { content: "obar", attrs: { AdornmentStyle: "-1" } }],
    });
    const created = doc.getParagraphElements().at(-1)!;
    const id = getParagraphId(created);
    const runsBefore = findChildren(created, "Text").map((r) => textContent(r));

    const result = await handleReplaceText({ path, find: "foobar", replace: "TARGET", preview: true });
    const body = JSON.parse(result.content[0]!.text);
    expect(body.totalMatches).toBe(0);
    expect(body.totalSkipped).toBe(1);
    const match = body.matches.find((m: { id: string }) => m.id === id);
    expect(match).toBeDefined();
    expect(match.wouldReplace).toBe(0);
    expect(match.skipped).toBe(1);

    const runsAfter = findChildren(doc.getParagraphElements().find((p) => getParagraphId(p) === id)!, "Text").map((r) =>
      textContent(r),
    );
    expect(runsAfter).toEqual(runsBefore);
  });

  test("preview with zero matches returns an empty list, not an error", async () => {
    const { path } = freshDoc("preview-no-match");
    const result = await handleReplaceText({ path, find: "zzz_no_such_text_zzz", replace: "x", preview: true });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);
    expect(body.matches).toEqual([]);
    expect(body.totalMatches).toBe(0);
  });

  test("preview respects parType/id/caseSensitive scoping the same as mutate mode", async () => {
    const { path } = freshDoc("preview-scoping");
    const csResult = await handleReplaceText({
      path,
      find: "grog",
      replace: "GROG",
      parType: "Dialogue",
      caseSensitive: true,
      preview: true,
    });
    const csBody = JSON.parse(csResult.content[0]!.text);
    expect(csBody.totalMatches).toBe(0);

    const badScope = await handleReplaceText({ path, find: "Zog", replace: "x", id: "does-not-exist", preview: true });
    expect(badScope.isError).toBe(true);
    expect(badScope.content[0]!.text).toContain("section id not found");
  });
});
