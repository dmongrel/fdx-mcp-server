// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * Shared helpers for reading/building <Paragraph> XmlElements — the top-level body paragraph
 * shape modeled by fdx.go's Paragraph struct. Used by get_par/edit_par/find_par/read_full_file
 * and the get_section* tools (Phase 2/3).
 */

import { type XmlElement, type XmlNode, createElement, findChildren, getAttr, setAttr, textContent } from "./xml.ts";

export interface TextRunInput {
  content: string;
  style?: string;
}

/** Concatenates all direct <Text> children's content, in order (styling attributes stripped). */
export function paragraphText(el: XmlElement): string {
  return findChildren(el, "Text").map(textContent).join("");
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
  const children: XmlNode[] = textRuns.map((tr) => {
    const textAttrs: Array<[string, string]> = tr.style ? [["Style", tr.style]] : [];
    return createElement("Text", textAttrs, [{ type: "text", value: tr.content }]);
  });
  return createElement("Paragraph", attrs, children);
}

/** Replaces a paragraph's <Text> run children wholesale with freshly built ones. */
export function setParagraphTextRuns(el: XmlElement, textRuns: TextRunInput[]): void {
  el.children = el.children.filter((c) => !(c.type === "element" && c.name === "Text"));
  for (const tr of textRuns) {
    const textAttrs: Array<[string, string]> = tr.style ? [["Style", tr.style]] : [];
    el.children.push(createElement("Text", textAttrs, [{ type: "text", value: tr.content }]));
  }
}

export function getParagraphId(el: XmlElement): string {
  return getAttr(el, "id") ?? "";
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

