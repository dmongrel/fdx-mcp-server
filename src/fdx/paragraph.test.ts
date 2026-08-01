// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { FdxDocument } from "./document.ts";
import { spliceParagraphText } from "./paragraph.ts";
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
