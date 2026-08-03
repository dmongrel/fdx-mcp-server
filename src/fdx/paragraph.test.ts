// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { FdxDocument } from "./document.ts";
import { spliceParagraphText, expandDualDialogue } from "./paragraph.ts";
import { findChildren, textContent } from "./xml.ts";

function docWithParagraph(paragraphXml: string): FdxDocument {
  return FdxDocument.parse(`<?xml version="1.0"?>
<FinalDraft Version="6">
  <Content>
    ${paragraphXml}
  </Content>
</FinalDraft>`);
}

describe("spliceParagraphText", () => {
  test("splices within a single run, preserving that run's attributes", () => {
    const doc = docWithParagraph(
      `<Paragraph Type="Scene Heading" id="a"><Text AdornmentStyle="-1">INT. CAVE - NIGHT</Text></Paragraph>`,
    );
    const para = doc.getParagraphElements()[0]!;
    const outcome = spliceParagraphText(para, 5, 9, "CAVERN");
    expect(outcome).toBe("single-run");
    const runs = findChildren(para, "Text");
    expect(runs).toHaveLength(1);
    expect(textContent(runs[0]!)).toBe("INT. CAVERN - NIGHT");
    expect(runs[0]!.attrs).toEqual([["AdornmentStyle", "-1"]]);
  });

  test("leaves runs before/after the spliced run untouched", () => {
    const doc = docWithParagraph(
      `<Paragraph Type="Scene Heading" id="a"><Text>INT. </Text><Text AdornmentStyle="-1">CAVE</Text><Text> - NIGHT</Text></Paragraph>`,
    );
    const para = doc.getParagraphElements()[0]!;
    // "CAVE" is the second run, occupying [5, 9) in the concatenated text.
    const outcome = spliceParagraphText(para, 5, 9, "CAVERN");
    expect(outcome).toBe("single-run");
    const runs = findChildren(para, "Text");
    expect(runs).toHaveLength(3);
    expect(textContent(runs[0]!)).toBe("INT. ");
    expect(textContent(runs[1]!)).toBe("CAVERN");
    expect(runs[1]!.attrs).toEqual([["AdornmentStyle", "-1"]]);
    expect(textContent(runs[2]!)).toBe(" - NIGHT");
  });

  test("collapses to one plain run when the range spans multiple runs", () => {
    const doc = docWithParagraph(
      `<Paragraph Type="Scene Heading" id="a"><Text>INT. CA</Text><Text AdornmentStyle="-1">VE - NIGHT</Text></Paragraph>`,
    );
    const para = doc.getParagraphElements()[0]!;
    // "CAVE" spans both runs: [5, 9).
    const outcome = spliceParagraphText(para, 5, 9, "CAVERN");
    expect(outcome).toBe("collapsed");
    const runs = findChildren(para, "Text");
    expect(runs).toHaveLength(1);
    expect(textContent(runs[0]!)).toBe("INT. CAVERN - NIGHT");
    expect(runs[0]!.attrs).toEqual([]);
  });
});

describe("expandDualDialogue", () => {
  test("expands a wrapper into itself followed by its nested paragraphs", () => {
    const doc = docWithParagraph(`
      <Paragraph Type="Action" id="a1"><Text>Before.</Text></Paragraph>
      <Paragraph Type="General" id="wrap1">
        <DualDialogue>
          <Paragraph Type="Character" id="c1"><Text>ALICE</Text></Paragraph>
          <Paragraph Type="Dialogue" id="d1"><Text>Hi.</Text></Paragraph>
        </DualDialogue>
      </Paragraph>
      <Paragraph Type="Action" id="a2"><Text>After.</Text></Paragraph>
    `);
    const top = doc.getParagraphElements();
    const expanded = expandDualDialogue(top);
    expect(expanded.map((p) => p.attrs.find(([k]) => k === "id")?.[1])).toEqual([
      "a1",
      "wrap1",
      "c1",
      "d1",
      "a2",
    ]);
  });

  test("a paragraph list with no wrapper passes through unchanged", () => {
    const doc = docWithParagraph(`
      <Paragraph Type="Action" id="a1"><Text>Only.</Text></Paragraph>
    `);
    const top = doc.getParagraphElements();
    expect(expandDualDialogue(top)).toEqual(top);
  });

  test("a wrapper with no nested paragraphs contributes just itself", () => {
    const doc = docWithParagraph(`
      <Paragraph Type="General" id="wrap1"><DualDialogue/></Paragraph>
    `);
    const top = doc.getParagraphElements();
    const expanded = expandDualDialogue(top);
    expect(expanded).toHaveLength(1);
    expect(expanded[0]!.attrs.find(([k]) => k === "id")?.[1]).toBe("wrap1");
  });
});
