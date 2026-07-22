// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * Full-script screenplay PDF renderer for convert_to_pdf. Renders industry-standard US screenplay
 * format: Courier 12pt (10 cpi, 6 lines/inch) on 8.5x11in pages, using each paragraph Type's
 * <ElementSettings>/<ParagraphSpec> margins/alignment/space-before from the document itself when
 * present, falling back to standard screenplay margins otherwise. The title page is rendered from
 * <TitlePage> paragraphs using their own per-paragraph Alignment/LeftIndent/RightIndent attributes.
 * Started as a standalone prototype (convert-to-pdf.ts at the repo root) before being folded in
 * here as a real tool.
 */

import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { FdxDocument } from "../fdx/document.ts";
import { paragraphText, getParagraphType } from "../fdx/paragraph.ts";
import { findChild, findChildren, getAttr, type XmlElement } from "../fdx/xml.ts";

const PAGE_WIDTH = 612; // 8.5in @ 72dpi
const PAGE_HEIGHT = 792; // 11in @ 72dpi
const CPI = 10; // Courier 12pt is exactly 10 characters/inch
const LINE_HEIGHT = 12; // 6 lines/inch
const TOP_MARGIN = 72; // 1in
const BOTTOM_MARGIN = 72; // 1in
const FONT_SIZE = 12;

interface TypeSpec {
  leftIn: number;
  rightIn: number;
  alignment: "Left" | "Center" | "Right";
  spaceBeforeLines: number;
}

/** Industry-standard fallback margins (inches from left page edge) per paragraph Type. */
const DEFAULT_SPECS: Record<string, TypeSpec> = {
  "Scene Heading": { leftIn: 1.5, rightIn: 7.5, alignment: "Left", spaceBeforeLines: 1 },
  "Action": { leftIn: 1.5, rightIn: 7.5, alignment: "Left", spaceBeforeLines: 1 },
  "Character": { leftIn: 3.7, rightIn: 7.5, alignment: "Left", spaceBeforeLines: 1 },
  "Parenthetical": { leftIn: 3.1, rightIn: 5.5, alignment: "Left", spaceBeforeLines: 0 },
  "Dialogue": { leftIn: 2.5, rightIn: 6.0, alignment: "Left", spaceBeforeLines: 0 },
  "Transition": { leftIn: 1.5, rightIn: 7.5, alignment: "Right", spaceBeforeLines: 2 },
  "Shot": { leftIn: 1.5, rightIn: 7.5, alignment: "Left", spaceBeforeLines: 1 },
  "General": { leftIn: 1.5, rightIn: 7.5, alignment: "Left", spaceBeforeLines: 1 },
  "Note": { leftIn: 1.5, rightIn: 7.5, alignment: "Left", spaceBeforeLines: 1 },
};
const FALLBACK_SPEC: TypeSpec = DEFAULT_SPECS["Action"]!;

function parseInches(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseAlignment(v: string | undefined): "Left" | "Center" | "Right" | undefined {
  if (v === "Left" || v === "Center" || v === "Right") return v;
  return undefined;
}

/** Resolves a Type's layout spec, preferring the document's own ElementSettings when present. */
function resolveSpec(doc: FdxDocument, type: string): TypeSpec {
  const base = DEFAULT_SPECS[type] ?? FALLBACK_SPEC;
  const es = doc.findElementSettingsElement(type);
  const ps = es && findChild(es, "ParagraphSpec");
  // A single 12pt gap before a right-aligned "CUT TO:" reads as no gap at all next to the empty
  // left two-thirds of the line — always give Transitions at least a full blank line.
  const minSpaceBeforeLines = type === "Transition" ? 2 : 0;
  if (!ps) return { ...base, spaceBeforeLines: Math.max(base.spaceBeforeLines, minSpaceBeforeLines) };
  const spaceBeforePts = parseInches(getAttr(ps, "SpaceBefore"));
  const spaceBeforeLines = spaceBeforePts !== undefined ? Math.round(spaceBeforePts / LINE_HEIGHT) : base.spaceBeforeLines;
  return {
    leftIn: parseInches(getAttr(ps, "LeftIndent")) ?? base.leftIn,
    rightIn: parseInches(getAttr(ps, "RightIndent")) ?? base.rightIn,
    alignment: parseAlignment(getAttr(ps, "Alignment")) ?? base.alignment,
    spaceBeforeLines: Math.max(spaceBeforeLines, minSpaceBeforeLines),
  };
}

function wrapText(text: string, maxChars: number): string[] {
  if (maxChars < 1) maxChars = 1;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur === "" ? w : `${cur} ${w}`;
    if (candidate.length > maxChars && cur !== "") {
      lines.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

/** Paragraph types that must never be the last thing on a page — moved to the top of the next page instead. */
const NO_ORPHAN_AT_PAGE_BOTTOM = new Set(["Scene Heading", "Character", "Act Break", "New Act", "End of Act", "Act&Scene Break"]);
/** Types eligible to be pulled onto a Transition's page when the Transition would otherwise land alone. */
const PULLABLE_BEFORE_TRANSITION = new Set(["Action", "General"]);
/** Usable body lines per page (11in page, 1in top/bottom margins, 6 lines/inch). */
const MAX_LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - TOP_MARGIN - BOTTOM_MARGIN) / LINE_HEIGHT);
/** Safety cap on orphan-fix iterations; each fix only pushes content later, so this converges well before the cap. */
const MAX_ORPHAN_PASSES = 25;

export interface LayoutItem {
  type: string;
  heightLines: number; // content height only, excluding any gap-before
  block?: { lines: string[]; spec: TypeSpec };
  dual?: { left: { lines: string[]; spec: TypeSpec }[]; right: { lines: string[]; spec: TypeSpec }[] };
}

/** Pure line-counting simulation: assigns each item a page index, given a set of forced page breaks. */
export function simulateLayout(items: LayoutItem[], forcedBreakBefore: Set<number>): { pageOf: number[]; firstOnPage: boolean[] } {
  const pageOf: number[] = [];
  const firstOnPage: boolean[] = [];
  let page = 0;
  let linesUsed = 0;
  let hasContentOnPage = false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const gap = hasContentOnPage && item.block ? item.block.spec.spaceBeforeLines : 0;
    let needed = gap + item.heightLines;
    let isFirst = !hasContentOnPage;

    const mustBreak = (forcedBreakBefore.has(i) && hasContentOnPage) || (hasContentOnPage && linesUsed + needed > MAX_LINES_PER_PAGE);
    if (mustBreak) {
      page++;
      linesUsed = 0;
      isFirst = true;
      needed = item.heightLines; // no gap when starting a fresh page
    }

    pageOf[i] = page;
    firstOnPage[i] = isFirst;
    linesUsed += needed;
    hasContentOnPage = true;
  }

  return { pageOf, firstOnPage };
}

/**
 * Resolves forced page breaks that satisfy the screenplay orphan rules, iterating to a fixed
 * point since fixing one orphan can shift later content enough to create another:
 *  - Scene Heading / Character / Act Break can never be the last thing on a page — forced onto
 *    the next page instead (unless it's also the only thing on its page, which isn't an orphan).
 *  - Transition can never be the only thing on a page — the preceding Action/General paragraph
 *    is pulled onto the Transition's page instead of being left behind.
 */
export function resolveOrphanBreaks(items: LayoutItem[]): Set<number> {
  const forced = new Set<number>();
  for (let pass = 0; pass < MAX_ORPHAN_PASSES; pass++) {
    const { pageOf, firstOnPage } = simulateLayout(items, forced);
    let changed = false;

    for (let i = 0; i < items.length; i++) {
      const isLastOnPage = i === items.length - 1 || pageOf[i + 1] !== pageOf[i];

      if (isLastOnPage && !firstOnPage[i]! && NO_ORPHAN_AT_PAGE_BOTTOM.has(items[i]!.type)) {
        if (!forced.has(i)) {
          forced.add(i);
          changed = true;
        }
        continue;
      }

      const isAloneOnPage = firstOnPage[i]! && isLastOnPage;
      if (isAloneOnPage && items[i]!.type === "Transition" && i > 0) {
        const prev = items[i - 1]!;
        if (PULLABLE_BEFORE_TRANSITION.has(prev.type) && !forced.has(i - 1)) {
          forced.add(i - 1);
          changed = true;
        }
      }
    }

    if (!changed) break;
  }
  return forced;
}

class PageWriter {
  page: PDFPage;
  y = PAGE_HEIGHT - TOP_MARGIN;
  pageNo = 0;

  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
  ) {
    this.page = this.newPage();
  }

  private newPage(): PDFPage {
    const page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pageNo++;
    if (this.pageNo > 1) {
      page.drawText(`${this.pageNo}.`, {
        x: PAGE_WIDTH - 72,
        y: PAGE_HEIGHT - 54,
        size: FONT_SIZE,
        font: this.font,
      });
    }
    this.y = PAGE_HEIGHT - TOP_MARGIN;
    return page;
  }

  /** Starts a fresh page if `pageIndex` (0-based, from simulateLayout) differs from the current one. */
  goToPage(pageIndex: number): void {
    if (pageIndex !== this.pageNo - 1) this.page = this.newPage();
  }

  /** Draws one already-wrapped block of lines at the given spec and page position (no page-break logic — placement is predetermined). */
  drawBlock(lines: string[], spec: TypeSpec, isFirstOnPage: boolean): void {
    if (!isFirstOnPage) this.y -= spec.spaceBeforeLines * LINE_HEIGHT;
    for (const line of lines) {
      const x = xFor(spec, line, this.font);
      this.page.drawText(line, { x, y: this.y, size: FONT_SIZE, font: this.font });
      this.y -= LINE_HEIGHT;
    }
  }

  /** Draws two column blocks side by side (dual dialogue), advancing by the taller column. */
  drawColumns(left: { lines: string[]; spec: TypeSpec }[], right: { lines: string[]; spec: TypeSpec }[]): void {
    const startY = this.y;

    const drawSide = (blocks: { lines: string[]; spec: TypeSpec }[], leftIn: number, rightIn: number) => {
      let y = startY;
      for (const b of blocks) {
        for (const line of b.lines) {
          if (y < BOTTOM_MARGIN) break; // column overflow is rare; simple truncation guard
          const x = xForRange(leftIn, rightIn, b.spec.alignment, line, this.font);
          this.page.drawText(line, { x, y, size: FONT_SIZE, font: this.font });
          y -= LINE_HEIGHT;
        }
      }
      return y;
    };

    // Halve the standard dialogue column width for each side of the page.
    const leftY = drawSide(left, 1.5, 4.0);
    const rightY = drawSide(right, 4.25, 7.5);
    this.y = Math.min(leftY, rightY);
  }
}

function xForRange(leftIn: number, rightIn: number, alignment: TypeSpec["alignment"], line: string, font: PDFFont): number {
  const leftX = leftIn * 72;
  const rightX = rightIn * 72;
  const textWidth = font.widthOfTextAtSize(line, FONT_SIZE);
  if (alignment === "Right") return rightX - textWidth;
  if (alignment === "Center") return leftX + (rightX - leftX - textWidth) / 2;
  return leftX;
}

function xFor(spec: TypeSpec, line: string, font: PDFFont): number {
  return xForRange(spec.leftIn, spec.rightIn, spec.alignment, line, font);
}

/** Splits a <DualDialogue>'s flat nested-paragraph list into left/right speaker columns at the second Character cue. */
function splitDualDialogue(nested: XmlElement[]): { left: XmlElement[]; right: XmlElement[] } {
  let splitAt = -1;
  let characterCount = 0;
  for (let i = 0; i < nested.length; i++) {
    if (getParagraphType(nested[i]!) === "Character") {
      characterCount++;
      if (characterCount === 2) {
        splitAt = i;
        break;
      }
    }
  }
  if (splitAt === -1) return { left: nested, right: [] };
  return { left: nested.slice(0, splitAt), right: nested.slice(splitAt) };
}

function renderTitlePage(pdf: PDFDocument, font: PDFFont, doc: FdxDocument): void {
  const paragraphs = doc.getTitlePageParagraphs();
  if (paragraphs.length === 0 || paragraphs.every((p) => paragraphText(p).trim() === "")) return;

  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - TOP_MARGIN;
  for (const p of paragraphs) {
    if (y < BOTTOM_MARGIN) break; // title pages are fixed-length by convention; overflow is a caller error
    const text = paragraphText(p);
    const leftIn = parseInches(getAttr(p, "LeftIndent")) ?? 1.0;
    const rightIn = parseInches(getAttr(p, "RightIndent")) ?? 7.5;
    const alignment = parseAlignment(getAttr(p, "Alignment")) ?? "Left";
    if (text.trim() !== "") {
      const x = xForRange(leftIn, rightIn, alignment, text, font);
      page.drawText(text, { x, y, size: FONT_SIZE, font });
    }
    y -= LINE_HEIGHT;
  }
}

/** Builds the ordered, page-independent layout items for every top-level body paragraph. */
function buildLayoutItems(doc: FdxDocument): LayoutItem[] {
  const items: LayoutItem[] = [];

  for (const para of doc.getParagraphElements()) {
    const dd = findChild(para, "DualDialogue");
    if (dd) {
      const nested = findChildren(dd, "Paragraph");
      const { left, right } = splitDualDialogue(nested);
      const toBlocks = (side: XmlElement[]) =>
        side.map((p) => {
          const type = getParagraphType(p) || "Action";
          const spec = resolveSpec(doc, type);
          const maxChars = Math.max(1, Math.floor((4.0 - 1.5) * CPI) - 2);
          return { lines: wrapText(paragraphText(p), maxChars), spec };
        });
      const left2 = toBlocks(left);
      const right2 = toBlocks(right);
      const leftHeight = left2.reduce((n, b) => n + b.lines.length, 0);
      const rightHeight = right2.reduce((n, b) => n + b.lines.length, 0);
      items.push({ type: "DualDialogue", heightLines: Math.min(Math.max(leftHeight, rightHeight), 6), dual: { left: left2, right: right2 } });
      continue;
    }

    const type = getParagraphType(para) || "Action";
    const spec = resolveSpec(doc, type);
    const text = paragraphText(para);
    const maxChars = Math.max(1, Math.floor((spec.rightIn - spec.leftIn) * CPI));
    const lines = text.trim() === "" ? [""] : wrapText(text, maxChars);
    items.push({ type, heightLines: lines.length, block: { lines, spec } });
  }

  return items;
}

/** Renders an already-parsed FdxDocument to a full screenplay-formatted PDF (title page + body). */
export async function renderScreenplayPdf(doc: FdxDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);

  renderTitlePage(pdf, font, doc);

  const items = buildLayoutItems(doc);
  const forcedBreakBefore = resolveOrphanBreaks(items);
  const { pageOf, firstOnPage } = simulateLayout(items, forcedBreakBefore);

  const writer = new PageWriter(pdf, font);
  items.forEach((item, i) => {
    writer.goToPage(pageOf[i]!);
    if (item.dual) {
      writer.drawColumns(item.dual.left, item.dual.right);
    } else {
      writer.drawBlock(item.block!.lines, item.block!.spec, firstOnPage[i]!);
    }
  });

  return pdf.save();
}
