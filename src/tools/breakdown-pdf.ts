/**
 * PDF renderer for get_fdx_breakdown, using pdf-lib (pure JS, no native bindings — works unmodified
 * under Bun and Deno). Lays out the same BreakdownData the text/HTML renderers consume as a
 * printable A4 document: overview + paragraph breakdown, scene catalog (paginated), character
 * frequency bars, and a final scene-length/production-flags page. Mirrors Go's
 * tools/get_fdx_breakdown_pdf.go layout, adapted to pdf-lib's lower-level cell-less drawing API
 * (no built-in table/cell helper, so rows are drawn as text + rect primitives at fixed columns).
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { BreakdownData } from "./breakdown-report.ts";

const PAGE_WIDTH = 595.28; // A4 at 72dpi (pdf-lib uses points)
const PAGE_HEIGHT = 841.89;
const MARGIN = 42.5; // ~15mm

function fmt3g(n: number): string {
  if (n === 0) return "0";
  return parseFloat(n.toPrecision(3)).toString();
}

class Layout {
  page: PDFPage;
  y: number;
  pageNo = 0;

  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
    private title: string,
  ) {
    this.page = this.addPage();
    this.y = 0;
  }

  private addPage(): PDFPage {
    const page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pageNo++;
    page.drawText(`Script Breakdown - ${this.title}`, {
      x: MARGIN,
      y: PAGE_HEIGHT - MARGIN,
      size: 12,
      font: this.bold,
    });
    page.drawText(`Page ${this.pageNo}`, {
      x: PAGE_WIDTH / 2 - 15,
      y: MARGIN / 2,
      size: 8,
      font: this.font,
      color: rgb(0.3, 0.3, 0.3),
    });
    this.y = PAGE_HEIGHT - MARGIN - 24;
    return page;
  }

  newPage(): void {
    this.page = this.addPage();
  }

  ensureSpace(needed: number): void {
    if (this.y - needed < MARGIN) this.newPage();
  }

  heading(text: string): void {
    this.ensureSpace(20);
    this.page.drawText(text, { x: MARGIN, y: this.y, size: 11, font: this.bold });
    this.y -= 16;
  }

  line(text: string, opts: { size?: number; font?: PDFFont } = {}): void {
    this.ensureSpace(14);
    this.page.drawText(text, { x: MARGIN, y: this.y, size: opts.size ?? 10, font: opts.font ?? this.font });
    this.y -= 14;
  }

  gap(n = 8): void {
    this.y -= n;
  }
}

export async function renderBreakdownPdf(d: BreakdownData): Promise<Uint8Array> {
  const title = d.title || "(untitled)";
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const l = new Layout(doc, font, bold, title);

  // Page 1: overview + paragraph breakdown.
  l.heading("Document Overview");
  l.line(
    `Total Pages: ${d.stats.totalPages}    Total Paragraphs: ${d.stats.paragraphCount}    Scenes: ${d.stats.sceneCount}    Act Breaks: ${d.stats.actBreakCount}`,
  );
  l.gap();

  l.heading("Paragraph Breakdown");
  for (const t of d.sortedTypes) {
    l.ensureSpace(14);
    l.page.drawText(t, { x: MARGIN, y: l.y, size: 10, font });
    l.page.drawText(String(d.stats.byType[t]), { x: MARGIN + 200, y: l.y, size: 10, font });
    l.y -= 14;
  }

  // Scene catalog, paginated ~35 rows/page.
  l.newPage();
  l.heading(`Scene Catalog (total scripted pages: ${fmt3g(d.totalLength)})`);
  const drawSceneHeader = () => {
    l.ensureSpace(14);
    const cols = [
      { x: MARGIN, w: 20, text: "#" },
      { x: MARGIN + 20, w: 30, text: "Page" },
      { x: MARGIN + 50, w: 30, text: "Len" },
      { x: MARGIN + 80, w: 40, text: "Intro" },
      { x: MARGIN + 120, w: 300, text: "Location / Time" },
    ];
    for (const c of cols) l.page.drawText(c.text, { x: c.x, y: l.y, size: 9, font: bold });
    l.y -= 12;
  };
  drawSceneHeader();
  let rowsOnPage = 0;
  d.scenes.forEach((s, i) => {
    if (rowsOnPage >= 35) {
      l.newPage();
      l.heading(`Scene Catalog (continued)`);
      drawSceneHeader();
      rowsOnPage = 0;
    }
    let loc = s.location ?? "";
    if (s.timeOfDay) loc += ` - ${s.timeOfDay}`;
    if (loc.length > 70) loc = loc.slice(0, 67) + "...";
    l.ensureSpace(12);
    l.page.drawText(String(i + 1), { x: MARGIN, y: l.y, size: 9, font });
    l.page.drawText(String(s.page), { x: MARGIN + 20, y: l.y, size: 9, font });
    l.page.drawText(s.length.toFixed(2), { x: MARGIN + 50, y: l.y, size: 9, font });
    l.page.drawText(s.intro ?? "", { x: MARGIN + 80, y: l.y, size: 9, font });
    l.page.drawText(loc, { x: MARGIN + 120, y: l.y, size: 9, font });
    l.y -= 12;
    rowsOnPage++;
  });

  // Character frequency as horizontal bars.
  l.newPage();
  l.heading("Character Frequency");
  const maxTotal = d.rankedChars.reduce((m, c) => Math.max(m, c.total), 0);
  const barMaxWidth = 260;
  for (const c of d.rankedChars) {
    l.ensureSpace(14);
    l.page.drawText(c.name, { x: MARGIN, y: l.y, size: 9, font });
    const barW = maxTotal > 0 ? (barMaxWidth * c.total) / maxTotal : 0;
    l.page.drawRectangle({ x: MARGIN + 110, y: l.y - 2, width: barW, height: 8, color: rgb(74 / 255, 144 / 255, 217 / 255) });
    l.page.drawText(`${c.total} (${c.sceneCount} scenes)`, { x: MARGIN + 110 + barMaxWidth + 6, y: l.y, size: 9, font });
    l.y -= 14;
  }

  // Final page: scene-length analysis + production flags.
  l.newPage();
  l.heading("Scene-Length Analysis");
  if (d.shortestIdx >= 0) {
    l.line(`Shortest: ${fmt3g(d.scenes[d.shortestIdx]!.length)} pages (scene #${d.shortestIdx + 1})`);
  }
  if (d.longestIdx >= 0) {
    l.line(`Longest: ${fmt3g(d.scenes[d.longestIdx]!.length)} pages (scene #${d.longestIdx + 1})`);
  }
  if (d.scenes.length > 0) {
    l.line(`Average: ${fmt3g(d.totalLength / d.scenes.length)} pages`);
  }
  l.line(`Total scripted: ${fmt3g(d.totalLength)} pages`);
  l.gap();

  l.heading("Production Flags");
  l.line(`Color-coded scenes: ${d.colorCoded} of ${d.scenes.length}`);
  l.line(`Scenes > 1 page: ${d.overOnePage}`);
  l.line(`Missing time-of-day: ${d.missingTime}`);
  if (d.noArcChars.length > 0) {
    const text = `Characters without arc beats: ${d.noArcChars.length} (${d.noArcChars.join(", ")})`;
    // Wrap manually at ~95 chars/line since pdf-lib has no built-in multi-cell wrap helper.
    const maxChars = 95;
    for (let i = 0; i < text.length; i += maxChars) {
      l.line(text.slice(i, i + maxChars));
    }
  } else {
    l.line("Characters without arc beats: 0");
  }

  return doc.save();
}
