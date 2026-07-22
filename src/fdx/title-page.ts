// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * Shared title-page / copyright-block machinery: paragraph builders matching FinalDraft's
 * standard title-page layout, plus the create/edit/remove logic for both edit_title_page and
 * edit_copyright. Mirrors Go's tools/edit_title_page.go + tools/copyright.go.
 */

import { type XmlElement, type XmlNode, createElement, findChild, getAttr } from "./xml.ts";
import { paragraphText } from "./paragraph.ts";

/* ---------------------------------------------------------------- */
/*  Layout constants (mirrors Go's edit_title_page.go constants)     */
/* ---------------------------------------------------------------- */

const TP_FONT = "Courier Final Draft";
const TP_SIZE = "12";
const TP_LEFT_INDENT = "1.00";
const TP_RIGHT_INDENT = "7.50";
const TP_FIRST_INDENT = "0.00";
const TP_LEADING = "Regular";
const TP_OUTLINE_LEVEL = "1";
const TP_SPACE_BEFORE = "0";
const TP_SPACING = "1";
const TP_STARTS_NEW = "No";

const TP_TOP_SPACING = 20;
const TP_BY_GAP = 4;
const TP_BOTTOM_SPACING = 18;

/** Target paragraph count a title page is trimmed down to (see enforceTitlePageLength). */
export const STANDARD_TITLE_PAGE_LINES = 48;

const DEFAULT_BY_LINE = "Written by";
const BASED_ON_REGION_SLOTS = 4;
const CONTACT_REGION_SLOTS = 5;
const BASED_ON_PLACEHOLDER = "Based on, If Any";

export const COPYRIGHT_SYMBOL = "©";
export const ALL_RIGHTS_RESERVED_TEXT = "All Rights Reserved.";
const COPYRIGHT_REGION_SLOTS = 2;

export interface EditTitlePageRequest {
  title?: string;
  subtitle?: string;
  byLine?: string;
  author?: string;
  basedOn?: string;
  originalAuthor?: string;
  contactName?: string;
  contactAddressLine1?: string;
  contactAddressLine2?: string;
  contactCityStateZip?: string;
  contactPhone?: string;
  copyrightOwner?: string;
  copyrightYear?: string;
  copyrightAllRightsReserved?: boolean;
}

/* ---------------------------------------------------------------- */
/*  Paragraph builders                                               */
/* ---------------------------------------------------------------- */

/** Builds a single title-page paragraph with the shared layout attributes and zero or more text runs. */
export function tpParagraph(alignment: string, ...runs: string[]): XmlElement {
  const attrs: Array<[string, string]> = [
    ["Alignment", alignment],
    ["FirstIndent", TP_FIRST_INDENT],
    ["Leading", TP_LEADING],
    ["LeftIndent", TP_LEFT_INDENT],
    ["OutlineLevel", TP_OUTLINE_LEVEL],
    ["RightIndent", TP_RIGHT_INDENT],
    ["SpaceBefore", TP_SPACE_BEFORE],
    ["Spacing", TP_SPACING],
    ["StartsNewPage", TP_STARTS_NEW],
  ];
  const children: XmlNode[] = runs.map((r) =>
    createElement(
      "Text",
      [
        ["AdornmentStyle", "0"],
        ["Font", TP_FONT],
        ["RevisionID", "0"],
        ["Size", TP_SIZE],
      ],
      [{ type: "text", value: r }],
    ),
  );
  return createElement("Paragraph", attrs, children);
}

/** Builds a content paragraph for an optional block: blank when content is empty. */
export function tpBlock(alignment: string, content: string): XmlElement {
  return content === "" ? tpParagraph(alignment) : tpParagraph(alignment, content);
}

/** Returns n blank title-page paragraphs with the given alignment. */
export function blankParagraphs(alignment: string, n: number): XmlElement[] {
  return Array.from({ length: n }, () => tpParagraph(alignment));
}

/** Replaces a paragraph's Text spans with a single span, reusing the first existing span's styling. */
export function setParagraphText(p: XmlElement, content: string): void {
  const existingText = findChild(p, "Text");
  p.children = p.children.filter((c) => !(c.type === "element" && c.name === "Text"));
  if (content === "") return;
  const attrs: Array<[string, string]> = existingText
    ? existingText.attrs.map(([k, v]) => [k, v])
    : [
        ["AdornmentStyle", "0"],
        ["Font", TP_FONT],
        ["RevisionID", "0"],
        ["Size", TP_SIZE],
      ];
  p.children.push(createElement("Text", attrs, [{ type: "text", value: content }]));
}

/* ---------------------------------------------------------------- */
/* ---------------------------------------------------------------- */

function capitalizeWords(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/** Case-insensitive "copyright"-prefix test — the copyright block is always the first title-page paragraph. */
export function isCopyrightText(s: string): boolean {
  return s.trim().toLowerCase().startsWith("copyright");
}

/** Renders "Copyright © <year> <owner>." title-cased with a single trailing period; "" if owner is blank. */
export function buildCopyrightLine(owner: string, year: string): string {
  owner = owner.trim();
  if (owner === "") return "";
  const y = year.trim() === "" ? String(new Date().getFullYear()) : year.trim();
  const line = capitalizeWords(`Copyright ${COPYRIGHT_SYMBOL} ${y} ${owner}`);
  return line.replace(/\.+$/, "") + ".";
}

/** Resolves the optional allRightsReserved flag: defaults to true when omitted. */
export function copyrightAllRights(flag: boolean | undefined): boolean {
  return flag === undefined || flag;
}

export function copyrightLines(owner: string, year: string, allRightsReserved: boolean): [string, string] {
  const line1 = buildCopyrightLine(owner, year);
  const line2 = line1 !== "" && allRightsReserved ? ALL_RIGHTS_RESERVED_TEXT : "";
  return [line1, line2];
}

/** Builds the two-paragraph copyright block (both Left-aligned); blank paragraphs when owner is blank. */
export function buildCopyrightParagraphs(owner: string, year: string, allRightsReserved: boolean): XmlElement[] {
  const [line1, line2] = copyrightLines(owner, year, allRightsReserved);
  return [tpBlock("Left", line1), tpBlock("Left", line2)];
}

/** Writes the copyright block into the first two paragraphs, prepending blanks first if fewer than two exist. */
export function setCopyrightBlock(paras: XmlElement[], owner: string, year: string, allRightsReserved: boolean): XmlElement[] {
  const out = [...paras];
  while (out.length < COPYRIGHT_REGION_SLOTS) out.unshift(tpParagraph("Left"));
  const [line1, line2] = copyrightLines(owner, year, allRightsReserved);
  setParagraphText(out[0]!, line1);
  setParagraphText(out[1]!, line2);
  return out;
}

/** Blanks the copyright block (first two paragraphs) if present. Returns whether one was found/cleared. */
export function clearCopyrightBlock(paras: XmlElement[]): boolean {
  if (paras.length === 0 || !isCopyrightText(paragraphText(paras[0]!))) return false;
  setParagraphText(paras[0]!, "");
  if (paras.length > 1) setParagraphText(paras[1]!, "");
  return true;
}

/** Returns the copyright block as text (line1 + optional line2) and whether one was found. */
export function copyrightText(paras: XmlElement[]): { text: string; found: boolean } {
  if (paras.length === 0 || !isCopyrightText(paragraphText(paras[0]!))) return { text: "", found: false };
  const line1 = paragraphText(paras[0]!);
  if (paras.length > 1) {
    const line2 = paragraphText(paras[1]!);
    if (line2.trim() !== "") return { text: `${line1}\n${line2}`, found: true };
  }
  return { text: line1, found: true };
}

/* ---------------------------------------------------------------- */
/*  Based-on / contact blocks                                       */
/* ---------------------------------------------------------------- */

function buildBasedOnParagraphs(alignment: string, req: EditTitlePageRequest): XmlElement[] {
  if ((req.basedOn ?? "").trim() === "" && (req.originalAuthor ?? "").trim() === "") {
    return blankParagraphs(alignment, BASED_ON_REGION_SLOTS);
  }
  return [
    tpParagraph(alignment, "Based on"),
    tpBlock(alignment, req.basedOn ?? ""),
    tpParagraph(alignment, "By"),
    tpBlock(alignment, req.originalAuthor ?? ""),
  ];
}

function buildContactParagraphs(alignment: string, req: EditTitlePageRequest): XmlElement[] {
  const ps: XmlElement[] = [];
  for (const v of [req.contactName, req.contactAddressLine1, req.contactAddressLine2, req.contactCityStateZip, req.contactPhone]) {
    if ((v ?? "").trim() !== "") ps.push(tpParagraph(alignment, v!));
  }
  while (ps.length < CONTACT_REGION_SLOTS) ps.push(tpParagraph(alignment));
  return ps;
}

function isBasedOnPlaceholder(s: string): boolean {
  return s.trim().toLowerCase() === BASED_ON_PLACEHOLDER.toLowerCase();
}

function isBylineText(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t === "by" || t === "written by";
}

function isContactAlignment(a: string): boolean {
  return a === "Left" || a === "Full";
}

function hasAnyContactField(req: EditTitlePageRequest): boolean {
  return [req.contactName, req.contactAddressLine1, req.contactAddressLine2, req.contactCityStateZip, req.contactPhone].some(
    (v) => (v ?? "").trim() !== "",
  );
}

/** First index >= COPYRIGHT_REGION_SLOTS of a non-empty contact-aligned paragraph, or -1. */
function findContactStart(paras: XmlElement[]): number {
  for (let i = COPYRIGHT_REGION_SLOTS; i < paras.length; i++) {
    if (isContactAlignment(getAttr(paras[i]!, "Alignment") ?? "") && paragraphText(paras[i]!) !== "") return i;
  }
  return -1;
}

/** Trims blank paragraphs immediately before the contact block until the page is at/under the target length. */
function enforceTitlePageLength(paras: XmlElement[]): XmlElement[] {
  const out = [...paras];
  let cs = findContactStart(out);
  if (cs < 0) return out;
  while (out.length > STANDARD_TITLE_PAGE_LINES && cs > 0 && paragraphText(out[cs - 1]!) === "") {
    out.splice(cs - 1, 1);
    cs--;
  }
  return out;
}

/* ---------------------------------------------------------------- */
/*  Full-page build (create) and in-place edit                       */
/* ---------------------------------------------------------------- */

/** Assembles the full ordered paragraph list for a fresh title page (create mode). */
export function buildTitlePage(req: EditTitlePageRequest): XmlElement[] {
  const byLine = (req.byLine ?? "").trim() === "" ? DEFAULT_BY_LINE : req.byLine!;

  const ps: XmlElement[] = [];
  ps.push(...buildCopyrightParagraphs(req.copyrightOwner ?? "", req.copyrightYear ?? "", copyrightAllRights(req.copyrightAllRightsReserved)));
  ps.push(...blankParagraphs("Left", TP_TOP_SPACING));
  ps.push(tpBlock("Center", req.title ?? ""));
  ps.push(tpBlock("Center", req.subtitle ?? ""));
  ps.push(tpParagraph("Center")); // spacer between subtitle and by-line
  ps.push(tpBlock("Center", byLine));
  ps.push(tpBlock("Center", req.author ?? ""));
  ps.push(...blankParagraphs("Center", TP_BY_GAP));
  ps.push(...buildBasedOnParagraphs("Center", req));
  ps.push(...blankParagraphs("Center", TP_BOTTOM_SPACING));
  ps.push(...buildContactParagraphs("Left", req));
  return enforceTitlePageLength(ps);
}

/**
 * Returns an updated copy of an existing title page paragraph slice, applying single-line
 * overwrites (title/subtitle/author/byLine) and wholesale contact/based-on block rebuilds.
 * Mirrors Go's editExistingTitlePage.
 */
export function editExistingTitlePage(paragraphs: XmlElement[], req: EditTitlePageRequest): XmlElement[] {
  let byIdx = -1;
  for (let i = 0; i < paragraphs.length; i++) {
    if (getAttr(paragraphs[i]!, "Alignment") === "Center" && isBylineText(paragraphText(paragraphs[i]!))) {
      byIdx = i;
      break;
    }
  }

  const contactStart = findContactStart(paragraphs);

  const upper = byIdx >= 0 ? byIdx : paragraphs.length;
  let titleIdx = -1;
  let subtitleIdx = -1;
  for (let i = 0; i < upper; i++) {
    if (getAttr(paragraphs[i]!, "Alignment") !== "Center" || paragraphText(paragraphs[i]!) === "") continue;
    if (titleIdx === -1) titleIdx = i;
    else if (subtitleIdx === -1) {
      subtitleIdx = i;
      break;
    }
  }

  let authorIdx = -1;
  if (byIdx >= 0) {
    for (let i = byIdx + 1; i < paragraphs.length; i++) {
      if (getAttr(paragraphs[i]!, "Alignment") === "Center" && paragraphText(paragraphs[i]!) !== "") {
        authorIdx = i;
        break;
      }
    }
  }

  let basedOnStart = -1;
  let basedOnEnd = -1;
  {
    const hi = contactStart >= 0 ? contactStart : paragraphs.length;
    for (let i = authorIdx + 1; i < hi; i++) {
      if (getAttr(paragraphs[i]!, "Alignment") !== "Center" || paragraphText(paragraphs[i]!) === "") continue;
      if (basedOnStart === -1) basedOnStart = i;
      basedOnEnd = i;
    }
  }

  const apply = (idx: number, val: string | undefined) => {
    if (idx >= 0 && (val ?? "").trim() !== "") setParagraphText(paragraphs[idx]!, val!);
  };
  apply(titleIdx, req.title);
  apply(subtitleIdx, req.subtitle);
  apply(authorIdx, req.author);
  if (byIdx >= 0) {
    const byText = (req.byLine ?? "").trim() !== "" ? req.byLine! : DEFAULT_BY_LINE;
    setParagraphText(paragraphs[byIdx]!, byText);
  }

  let result = paragraphs;

  if (contactStart >= 0 && hasAnyContactField(req)) {
    const alignment = getAttr(result[contactStart]!, "Alignment") ?? "Left";
    result = [...result.slice(0, contactStart), ...buildContactParagraphs(alignment, req)];
  }

  if (basedOnStart >= 0) {
    const supplied = (req.basedOn ?? "").trim() !== "" || (req.originalAuthor ?? "").trim() !== "";
    const placeholder = basedOnStart === basedOnEnd && isBasedOnPlaceholder(paragraphText(paragraphs[basedOnStart]!));
    if (supplied || placeholder) {
      const alignment = getAttr(paragraphs[basedOnStart]!, "Alignment") ?? "Center";
      result = [...result.slice(0, basedOnStart), ...buildBasedOnParagraphs(alignment, req), ...result.slice(basedOnEnd + 1)];
    }
  }

  if ((req.copyrightOwner ?? "").trim() !== "") {
    result = setCopyrightBlock(result, req.copyrightOwner!, req.copyrightYear ?? "", copyrightAllRights(req.copyrightAllRightsReserved));
  }

  return enforceTitlePageLength(result);
}

