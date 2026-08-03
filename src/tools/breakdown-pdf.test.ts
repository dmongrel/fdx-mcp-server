// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { Layout, renderBreakdownPdf } from "./breakdown-pdf.ts";
import { buildBreakdownData } from "./breakdown-report.ts";
import { FdxDocument } from "../fdx/document.ts";

describe("Layout", () => {
  test("constructor leaves y at the content-start position set by addPage, not 0", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const layout = new Layout(doc, font, bold, "Test Title");

    expect(layout.y).toBeGreaterThan(700);
  });
});

test("includes the skip-count warning under Character Frequency when present", async () => {
  const baseSource = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1"><Text>INT. ROOM - DAY</Text></Paragraph>
    <Paragraph Type="Character" id="c1"><Text>ALICE</Text></Paragraph>
    <Paragraph Type="Dialogue" id="d1"><Text>Hi.</Text></Paragraph>
  </Content>
</FinalDraft>`;
  const dualSource = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1"><Text>INT. ROOM - DAY</Text></Paragraph>
    <Paragraph Type="Character" id="wrap">
      <Text>ALICE</Text>
      <DualDialogue>
        <Paragraph Type="Character" id="c1"><Text>ALICE</Text></Paragraph>
        <Paragraph Type="Dialogue" id="d1"><Text>Hi.</Text></Paragraph>
      </DualDialogue>
    </Paragraph>
  </Content>
</FinalDraft>`;

  const baseData = buildBreakdownData(FdxDocument.parse(baseSource));
  const dualData = buildBreakdownData(FdxDocument.parse(dualSource));
  expect(baseData.skippedNestedCount).toBe(0);
  expect(dualData.skippedNestedCount).toBe(2);

  const baseBytes = await renderBreakdownPdf(baseData);
  const dualBytes = await renderBreakdownPdf(dualData);
  expect(dualBytes.length).toBeGreaterThan(baseBytes.length);
});
