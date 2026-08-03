// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { Layout } from "./breakdown-pdf.ts";

describe("Layout", () => {
  test("constructor leaves y at the content-start position set by addPage, not 0", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const layout = new Layout(doc, font, bold, "Test Title");

    expect(layout.y).toBeGreaterThan(700);
  });
});
