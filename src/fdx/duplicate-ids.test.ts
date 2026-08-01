// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { FdxDocument } from "./document.ts";
import { applyDuplicateIdFixes, findDuplicateParagraphIds, planDuplicateIdFixes, duplicateIdWarning } from "./duplicate-ids.ts";
import { findParagraphIdAttr } from "./paragraph.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function docWith(paragraphsXml: string): FdxDocument {
  return FdxDocument.parse(`<?xml version="1.0"?>
<FinalDraft Version="6">
  <Content>
    ${paragraphsXml}
  </Content>
</FinalDraft>`);
}

describe("findDuplicateParagraphIds", () => {
  test("returns nothing when all ids are unique", () => {
    const doc = docWith(`
      <Paragraph Type="Action" id="a"><Text>one</Text></Paragraph>
      <Paragraph Type="Action" id="b"><Text>two</Text></Paragraph>
    `);
    expect(findDuplicateParagraphIds(doc)).toEqual([]);
  });

  test("groups paragraphs sharing an id, in document order", () => {
    const doc = docWith(`
      <Paragraph Type="Action" id="dup"><Text>first</Text></Paragraph>
      <Paragraph Type="Action" id="unique"><Text>middle</Text></Paragraph>
      <Paragraph Type="Dialogue" id="dup"><Text>second</Text></Paragraph>
    `);
    const groups = findDuplicateParagraphIds(doc);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.id).toBe("dup");
    expect(groups[0]!.count).toBe(2);
    expect(groups[0]!.paragraphs.map((p) => p.index)).toEqual([0, 2]);
    expect(groups[0]!.paragraphs[0]!.textPreview).toBe("first");
    expect(groups[0]!.paragraphs[1]!.type).toBe("Dialogue");
  });

  test("finds duplicates across mixed id/Id/ID attribute casing", () => {
    const doc = docWith(`
      <Paragraph Type="Action" id="dup"><Text>first</Text></Paragraph>
      <Paragraph Type="Action" Id="dup"><Text>second</Text></Paragraph>
      <Paragraph Type="Action" ID="dup"><Text>third</Text></Paragraph>
    `);
    const groups = findDuplicateParagraphIds(doc);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.count).toBe(3);
  });

  test("ignores paragraphs with no id attribute at all", () => {
    const doc = docWith(`
      <Paragraph Type="Action"><Text>no id</Text></Paragraph>
      <Paragraph Type="Action"><Text>also no id</Text></Paragraph>
    `);
    expect(findDuplicateParagraphIds(doc)).toEqual([]);
  });
});

describe("planDuplicateIdFixes / applyDuplicateIdFixes", () => {
  test("keeps the first occurrence's id and mints fresh uuids for the rest", () => {
    const doc = docWith(`
      <Paragraph Type="Action" id="dup"><Text>first</Text></Paragraph>
      <Paragraph Type="Action" id="dup"><Text>second</Text></Paragraph>
      <Paragraph Type="Action" id="dup"><Text>third</Text></Paragraph>
    `);
    const plan = planDuplicateIdFixes(doc);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.keptIndex).toBe(0);
    expect(plan[0]!.reassigned).toHaveLength(2);
    for (const r of plan[0]!.reassigned) {
      expect(r.newId).toMatch(UUID_RE);
      expect(r.newId).not.toBe("dup");
    }

    applyDuplicateIdFixes(doc, plan);
    const paragraphs = doc.getParagraphElements();
    expect(findParagraphIdAttr(paragraphs[0]!)!.value).toBe("dup");
    expect(findParagraphIdAttr(paragraphs[1]!)!.value).toBe(plan[0]!.reassigned[0]!.newId);
    expect(findParagraphIdAttr(paragraphs[2]!)!.value).toBe(plan[0]!.reassigned[1]!.newId);

    const uniqueIds = new Set(paragraphs.map((p) => findParagraphIdAttr(p)!.value));
    expect(uniqueIds.size).toBe(3);
    expect(findDuplicateParagraphIds(doc)).toEqual([]);
  });

  test("preserves each paragraph's original attribute name casing when reassigning", () => {
    const doc = docWith(`
      <Paragraph Type="Action" id="dup"><Text>first</Text></Paragraph>
      <Paragraph Type="Action" Id="dup"><Text>second</Text></Paragraph>
      <Paragraph Type="Action" ID="dup"><Text>third</Text></Paragraph>
    `);
    const plan = planDuplicateIdFixes(doc);
    applyDuplicateIdFixes(doc, plan);
    const paragraphs = doc.getParagraphElements();
    expect(paragraphs[0]!.attrs.some(([k]) => k === "id")).toBe(true);
    expect(paragraphs[1]!.attrs.some(([k]) => k === "Id")).toBe(true);
    expect(paragraphs[2]!.attrs.some(([k]) => k === "ID")).toBe(true);
  });

  test("planning twice does not mutate the document", () => {
    const doc = docWith(`
      <Paragraph Type="Action" id="dup"><Text>first</Text></Paragraph>
      <Paragraph Type="Action" id="dup"><Text>second</Text></Paragraph>
    `);
    planDuplicateIdFixes(doc);
    expect(findDuplicateParagraphIds(doc)).toHaveLength(1);
  });

  test("returns an empty plan when there is nothing to fix", () => {
    const doc = docWith(`<Paragraph Type="Action" id="a"><Text>one</Text></Paragraph>`);
    expect(planDuplicateIdFixes(doc)).toEqual([]);
  });
});

describe("duplicateIdWarning", () => {
  test("empty for a single match", () => {
    expect(duplicateIdWarning(1)).toBe("");
    expect(duplicateIdWarning(0)).toBe("");
  });

  test("non-empty and mentions the count for multiple matches", () => {
    const warning = duplicateIdWarning(4);
    expect(warning).toContain("4 paragraphs");
  });
});
