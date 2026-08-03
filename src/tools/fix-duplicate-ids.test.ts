// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleFixDuplicateIds } from "./fix-duplicate-ids.ts";
import { handleEditDualDialogue } from "./edit-dual-dialogue.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { findParagraphIdAttr } from "../fdx/paragraph.ts";

const SOURCE_WITH_DUPES = `<?xml version="1.0"?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Action" id="dup"><Text>first</Text></Paragraph>
    <Paragraph Type="Action" id="unique"><Text>middle</Text></Paragraph>
    <Paragraph Type="Dialogue" id="dup"><Text>second</Text></Paragraph>
  </Content>
</FinalDraft>`;

const SOURCE_CLEAN = `<?xml version="1.0"?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Action" id="a"><Text>one</Text></Paragraph>
  </Content>
</FinalDraft>`;

function freshDoc(key: string, source: string): { path: string; doc: FdxDocument } {
  const path = join(import.meta.dir, `fix-duplicate-ids-${key}.fdx`);
  const doc = FdxDocument.parse(source, path);
  documentCache.set(path, doc);
  return { path, doc };
}

describe("fix_duplicate_ids", () => {
  test("path and action are required", async () => {
    expect((await handleFixDuplicateIds(undefined)).isError).toBe(true);
    const { path } = freshDoc("missing-action", SOURCE_WITH_DUPES);
    expect((await handleFixDuplicateIds({ path })).isError).toBe(true);
  });

  test("rejects an invalid action", async () => {
    const { path } = freshDoc("bad-action", SOURCE_WITH_DUPES);
    const result = await handleFixDuplicateIds({ path, action: "delete" });
    expect(result.isError).toBe(true);
  });

  test("rejects a non-.fdx path", async () => {
    const result = await handleFixDuplicateIds({ path: "script.txt", action: "report" });
    expect(result.isError).toBe(true);
  });

  test("action=report does not mutate the document", async () => {
    const { path, doc } = freshDoc("report", SOURCE_WITH_DUPES);
    const result = await handleFixDuplicateIds({ path, action: "report" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("dup");

    const paragraphs = doc.getParagraphElements();
    expect(findParagraphIdAttr(paragraphs[0]!)!.value).toBe("dup");
    expect(findParagraphIdAttr(paragraphs[2]!)!.value).toBe("dup");
  });

  test("action=fix keeps the first occurrence's id and reassigns the rest", async () => {
    const { path, doc } = freshDoc("fix", SOURCE_WITH_DUPES);
    const result = await handleFixDuplicateIds({ path, action: "fix" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("call save_fdx");

    const paragraphs = doc.getParagraphElements();
    const ids = paragraphs.map((p) => findParagraphIdAttr(p)!.value);
    expect(ids[0]).toBe("dup");
    expect(ids[2]).not.toBe("dup");
    expect(new Set(ids).size).toBe(3);
  });

  test("reports nothing to fix for a clean document, on both actions", async () => {
    const { path } = freshDoc("clean", SOURCE_CLEAN);
    const report = await handleFixDuplicateIds({ path, action: "report" });
    expect(report.content[0]!.text).toBe("No duplicate paragraph ids found; nothing to fix.");
    const fix = await handleFixDuplicateIds({ path, action: "fix" });
    expect(fix.content[0]!.text).toBe("No duplicate paragraph ids found; nothing to fix.");
  });
});

const SOURCE_WITH_DUPES_AND_DUAL_DIALOGUE = `<?xml version="1.0"?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Action" id="dup"><Text>first</Text></Paragraph>
    <Paragraph Type="Character" id="char1"><Text>ALICE</Text></Paragraph>
    <Paragraph Type="Dialogue" id="dlg1"><Text>Hi.</Text></Paragraph>
    <Paragraph Type="Dialogue" id="dup"><Text>second</Text></Paragraph>
  </Content>
</FinalDraft>`;

describe("fix_duplicate_ids with a DualDialogue in the document", () => {
  async function withDualDialogue(key: string) {
    const { path } = freshDoc(key, SOURCE_WITH_DUPES_AND_DUAL_DIALOGUE);
    await handleEditDualDialogue({ path, action: "create", ids: ["char1", "dlg1"] });
    return path;
  }

  test("action=report reports the skipped-nested count", async () => {
    const path = await withDualDialogue("skip-report");
    const result = await handleFixDuplicateIds({ path, action: "report" });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text).toContain("2 paragraph(s) nested inside a DualDialogue block were not scanned by this call.");
  });

  test("action=fix reports the skipped-nested count", async () => {
    const path = await withDualDialogue("skip-fix");
    const result = await handleFixDuplicateIds({ path, action: "fix" });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text).toContain("2 paragraph(s) nested inside a DualDialogue block were not scanned by this call.");
  });

  test("no DualDialogue means no skip warning", async () => {
    const { path } = freshDoc("no-dual-dialogue", SOURCE_CLEAN);
    const result = await handleFixDuplicateIds({ path, action: "report" });
    expect(result.content[0]!.text).not.toContain("nested inside a DualDialogue");
  });
});

describe("fix_duplicate_ids action=report's newId omission", () => {
  test("report does not include newId in reassigned entries", async () => {
    const { path } = freshDoc("report-no-newid", SOURCE_WITH_DUPES);
    const result = await handleFixDuplicateIds({ path, action: "report" });
    const plan = JSON.parse(result.content[result.content.length - 1]!.text);
    expect(plan[0].reassigned[0]).not.toHaveProperty("newId");
    expect(plan[0].reassigned[0]).toHaveProperty("oldId", "dup");
    expect(plan[0].reassigned[0]).toHaveProperty("index");
    expect(plan[0].reassigned[0]).toHaveProperty("type");
  });

  test("fix still reports real newIds, unaffected by report's omission", async () => {
    const { path } = freshDoc("fix-still-has-newid", SOURCE_WITH_DUPES);
    const result = await handleFixDuplicateIds({ path, action: "fix" });
    const combined = result.content.map((c) => c.text).join("\n");
    const plan = JSON.parse(combined.slice(combined.indexOf("[")));
    expect(typeof plan[0].reassigned[0].newId).toBe("string");
    expect(plan[0].reassigned[0].newId.length).toBeGreaterThan(0);
  });
});
