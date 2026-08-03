// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * Shared helpers for reading/building <Paragraph> XmlElements — the top-level body paragraph
 * shape modeled by fdx.go's Paragraph struct. Used by get_par/edit_par/find_par/read_full_file
 * and the get_section* tools (Phase 2/3).
 */

import { type XmlElement, type XmlNode, createElement, findChild, findChildren, getAttr, setAttr, setTextContent, textContent } from "./xml.ts";

export interface TextRunInput {
  content: string;
  style?: string;
  /** Arbitrary passthrough <Text> attributes (AdornmentStyle, Font, Color, Size, RevisionID, ...). */
  attrs?: Record<string, string>;
}

/** A <Text> run as read from XML: content plus its full attribute set. */
export interface TextRun {
  content: string;
  attrs: Record<string, string>;
}

/** Concatenates all direct <Text> children's content, in order (styling attributes stripped). */
export function paragraphText(el: XmlElement): string {
  return findChildren(el, "Text").map(textContent).join("");
}

/** Reads a paragraph's <Text> runs with their full attribute sets, in order. */
export function getParagraphRuns(el: XmlElement): TextRun[] {
  return findChildren(el, "Text").map((child) => ({
    content: textContent(child),
    attrs: Object.fromEntries(child.attrs),
  }));
}

/**
 * Expands each paragraph in `paragraphs` that wraps a <DualDialogue> into itself followed by its
 * nested Paragraph children, in order. Paragraphs without a DualDialogue pass through unchanged.
 * Final Draft's format never nests a DualDialogue inside another, so this only descends one level.
 */
export function expandDualDialogue(paragraphs: XmlElement[]): XmlElement[] {
  const result: XmlElement[] = [];
  for (const p of paragraphs) {
    result.push(p);
    const dd = findChild(p, "DualDialogue");
    if (dd) result.push(...findChildren(dd, "Paragraph"));
  }
  return result;
}

/** Builds the <Text> attrs for a run: attrs map first, then `style` overriding Style if given. */
function buildTextAttrs(tr: TextRunInput): Array<[string, string]> {
  const attrs: Array<[string, string]> = tr.attrs ? Object.entries(tr.attrs) : [];
  if (tr.style) {
    const existing = attrs.find((a) => a[0] === "Style");
    if (existing) existing[1] = tr.style;
    else attrs.push(["Style", tr.style]);
  }
  return attrs;
}

/** Builds a new <Paragraph> element with Type/id/Alignment attrs and a run of <Text> children. */
export function buildParagraphElement(
  type: string,
  id: string,
  alignment: string | undefined,
  textRuns: TextRunInput[],
): XmlElement {
  const attrs: Array<[string, string]> = [
    ["Type", type],
    ["id", id],
  ];
  if (alignment) attrs.push(["Alignment", alignment]);
  const children: XmlNode[] = textRuns.map((tr) =>
    createElement("Text", buildTextAttrs(tr), [{ type: "text", value: tr.content }]),
  );
  return createElement("Paragraph", attrs, children);
}

/** Replaces a paragraph's <Text> run children wholesale with freshly built ones. */
export function setParagraphTextRuns(el: XmlElement, textRuns: TextRunInput[]): void {
  el.children = el.children.filter((c) => !(c.type === "element" && c.name === "Text"));
  for (const tr of textRuns) {
    el.children.push(createElement("Text", buildTextAttrs(tr), [{ type: "text", value: tr.content }]));
  }
}

export function getParagraphId(el: XmlElement): string {
  return getAttr(el, "id") ?? "";
}

/**
 * Finds a paragraph's id attribute by case-insensitive name match, returning both its exact
 * attribute name and value. FinalDraft's own UI has been observed to write `id`, `Id`, and `ID`
 * on different paragraphs within the same document after repeated editing sessions, so a repair
 * that assumes lowercase `id` misses those paragraphs entirely. Callers that write a new value
 * back must reuse the returned name verbatim — XML attribute names are case-sensitive, and
 * writing a hardcoded `id` would silently rename the attribute.
 */
export function findParagraphIdAttr(el: XmlElement): { name: string; value: string } | undefined {
  const found = el.attrs.find(([k]) => k.toLowerCase() === "id");
  return found ? { name: found[0], value: found[1] } : undefined;
}

/**
 * Splices `replacement` into a paragraph's concatenated text at character range [start, end),
 * preserving <Text> run boundaries and attributes when that range falls entirely inside one run.
 * When the range spans more than one run, every run collapses into a single plain (no-attrs) run
 * holding the full new text — styling that straddled the splice point can't be preserved, so it's
 * dropped rather than guessed at.
 */
export function spliceParagraphText(
  el: XmlElement,
  start: number,
  end: number,
  replacement: string,
): "single-run" | "collapsed" {
  const runs = findChildren(el, "Text");
  let pos = 0;
  for (const run of runs) {
    const content = textContent(run);
    const runStart = pos;
    const runEnd = pos + content.length;
    if (start >= runStart && end <= runEnd) {
      const localStart = start - runStart;
      const localEnd = end - runStart;
      setTextContent(run, content.slice(0, localStart) + replacement + content.slice(localEnd));
      return "single-run";
    }
    pos = runEnd;
  }
  const full = paragraphText(el);
  setParagraphTextRuns(el, [{ content: full.slice(0, start) + replacement + full.slice(end) }]);
  return "collapsed";
}

export function getParagraphType(el: XmlElement): string {
  return getAttr(el, "Type") ?? "";
}

export function setParagraphType(el: XmlElement, type: string): void {
  setAttr(el, "Type", type);
}

export function setParagraphAlignment(el: XmlElement, alignment: string): void {
  setAttr(el, "Alignment", alignment);
}

