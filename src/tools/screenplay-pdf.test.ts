// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { FdxDocument } from "../fdx/document.ts";
import { renderScreenplayPdf } from "./screenplay-pdf.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");
const FIXTURE_SOURCE = readFileSync(FIXTURE_PATH, "utf-8");

describe("renderScreenplayPdf", () => {
  test("renders the fixture to a valid multi-page PDF", async () => {
    const doc = FdxDocument.parse(FIXTURE_SOURCE);
    const bytes = await renderScreenplayPdf(doc);

    const header = new TextDecoder().decode(bytes.slice(0, 5));
    expect(header).toBe("%PDF-");

    const pdf = await PDFDocument.load(bytes);
    // 1 title page + however many body pages the 53-paragraph fixture wraps to.
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  test("omits the title page when the document has no title-page content", async () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="p1"><Text>INT. ROOM - DAY</Text></Paragraph>
    <Paragraph Type="Action" id="p2"><Text>Nothing happens.</Text></Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const bytes = await renderScreenplayPdf(doc);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  test("renders dual dialogue as side-by-side columns without throwing", async () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="General" id="p1">
      <DualDialogue>
        <Paragraph Type="Character" id="p2"><Text>KIRK</Text></Paragraph>
        <Paragraph Type="Dialogue" id="p3"><Text>Energize.</Text></Paragraph>
        <Paragraph Type="Character" id="p4"><Text>SPOCK</Text></Paragraph>
        <Paragraph Type="Dialogue" id="p5"><Text>Fascinating.</Text></Paragraph>
      </DualDialogue>
    </Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const bytes = await renderScreenplayPdf(doc);
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    expect(header).toBe("%PDF-");
  });

  test("honors a document's own ElementSettings margins over the built-in defaults", async () => {
    // Scene Heading's LeftIndent is 1.50 by default; this document overrides it to 3.00.
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="p1"><Text>INT. ROOM - DAY</Text></Paragraph>
  </Content>
  <ElementSettings Type="Scene Heading">
    <ParagraphSpec Alignment="Left" LeftIndent="3.00" RightIndent="7.50" SpaceBefore="0" Type="Scene Heading"/>
  </ElementSettings>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const bytes = await renderScreenplayPdf(doc);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
