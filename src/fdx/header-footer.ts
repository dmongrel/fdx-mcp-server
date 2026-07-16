/**
 * Shared HeaderAndFooter machinery: paragraph builders/renderers and the create/edit/remove logic
 * for both get_header_and_footer and edit_header_and_footer. Mirrors Go's
 * tools/get_header_and_footer.go + tools/edit_header_and_footer.go.
 */

import { type XmlElement, createElement, findChild, findChildren, getAttr, getOrCreateChild, setAttr, textContent } from "./xml.ts";

const HF_FONT = "Courier Final Draft";
const HF_SIZE = "12";
const HF_FIRST_INDENT = "0.00";
const HF_LEADING = "Regular";
const HF_OUTLINE_LEVEL = "1";
const HF_SPACE_BEFORE = "0";
const HF_SPACING = "1";
const HF_STARTS_NEW = "No";

const HF_HEADER_LEFT_INDENT = "0.50";
const HF_HEADER_RIGHT_INDENT = "-0.75";
const HF_FOOTER_LEFT_INDENT = "1.25";
const HF_FOOTER_RIGHT_INDENT = "-1.25";

/** The dynamic-label types the edit tool is allowed to write into a header or footer. */
export const HF_DYNAMIC_LABELS: string[] = ["Page #", "Date", "Time", "Script Title"];

export function knownDynamicLabel(t: string): boolean {
  return HF_DYNAMIC_LABELS.some((known) => known.toLowerCase() === t.toLowerCase());
}

export interface HeaderFooterPartInput {
  text?: string;
  label?: string;
}

export interface EditHeaderFooterRequest {
  headerParts?: HeaderFooterPartInput[];
  footerParts?: HeaderFooterPartInput[];
  footerFirstPage?: string;
  footerVisible?: string;
  headerFirstPage?: string;
  headerVisible?: string;
  startingPage?: string;
}

/** Builds one header/footer <Paragraph> from an ordered parts list; children preserve part order. */
export function buildHeaderParagraph(parts: HeaderFooterPartInput[], isFooter: boolean): XmlElement {
  const attrs: Array<[string, string]> = [
    ["Alignment", "Right"],
    ["FirstIndent", HF_FIRST_INDENT],
    ["Leading", HF_LEADING],
    ["LeftIndent", isFooter ? HF_FOOTER_LEFT_INDENT : HF_HEADER_LEFT_INDENT],
    ["OutlineLevel", HF_OUTLINE_LEVEL],
    ["RightIndent", isFooter ? HF_FOOTER_RIGHT_INDENT : HF_HEADER_RIGHT_INDENT],
    ["SpaceBefore", HF_SPACE_BEFORE],
    ["Spacing", HF_SPACING],
    ["StartsNewPage", HF_STARTS_NEW],
  ];
  const p = createElement("Paragraph", attrs);
  for (const part of parts) {
    if (part.label) {
      p.children.push(
        createElement("DynamicLabel", [
          ["AdornmentStyle", "0"],
          ["Font", HF_FONT],
          ["RevisionID", "0"],
          ["Size", HF_SIZE],
          ["Type", part.label],
        ]),
      );
    } else {
      p.children.push(
        createElement(
          "Text",
          [
            ["AdornmentStyle", "0"],
            ["Font", HF_FONT],
            ["RevisionID", "0"],
            ["Size", HF_SIZE],
          ],
          [{ type: "text", value: part.text ?? "" }],
        ),
      );
    }
  }
  return p;
}

/** Renders one header/footer paragraph as literal text plus "[Label]" tags, in document order. */
export function headerParagraphParts(p: XmlElement): string {
  let out = "";
  for (const child of p.children) {
    if (child.type !== "element") continue;
    if (child.name === "Text") out += textContent(child);
    else if (child.name === "DynamicLabel") out += `[${getAttr(child, "Type") ?? ""}]`;
  }
  return out;
}

/** Whether a title-page <HeaderAndFooter> element carries any content/attribute (vs. wholly absent). */
export function titlePageHfExists(hf: XmlElement | undefined): boolean {
  if (!hf) return false;
  const attrNames = ["FooterFirstPage", "FooterVisible", "HeaderFirstPage", "HeaderVisible", "StartingPage"];
  if (attrNames.some((a) => (getAttr(hf, a) ?? "") !== "")) return true;
  const header = findChild(hf, "Header");
  const footer = findChild(hf, "Footer");
  return (header ? findChildren(header, "Paragraph").length > 0 : false) || (footer ? findChildren(footer, "Paragraph").length > 0 : false);
}

/** Renders a HeaderAndFooter as labeled "[Header]"/"[Footer]" blocks, one paragraph per line. */
export function renderHeaderAndFooter(hf: XmlElement, element: string): string {
  let out = "";
  const header = findChild(hf, "Header");
  const footer = findChild(hf, "Footer");
  if (element !== "footer") {
    out += "[Header]\n";
    for (const p of header ? findChildren(header, "Paragraph") : []) out += headerParagraphParts(p) + "\n";
  }
  if (element !== "header") {
    out += "[Footer]\n";
    for (const p of footer ? findChildren(footer, "Paragraph") : []) out += headerParagraphParts(p) + "\n";
  }
  return out;
}

/** Builds a fresh <HeaderAndFooter> element with the standard defaults, applying supplied parts/attrs. */
export function buildHeaderAndFooterElement(req: EditHeaderFooterRequest): XmlElement {
  const hf = createElement("HeaderAndFooter", [
    ["FooterFirstPage", "Yes"],
    ["FooterVisible", "No"],
    ["HeaderFirstPage", "No"],
    ["HeaderVisible", "Yes"],
    ["StartingPage", "1"],
  ]);
  const header = createElement("Header");
  const footer = createElement("Footer");
  hf.children.push(header, footer);
  if (req.headerParts && req.headerParts.length > 0) header.children.push(buildHeaderParagraph(req.headerParts, false));
  if (req.footerParts && req.footerParts.length > 0) footer.children.push(buildHeaderParagraph(req.footerParts, true));
  applyHeaderFooterAttrs(hf, req);
  return hf;
}

/** Applies non-empty attribute fields onto an existing <HeaderAndFooter> element. */
export function applyHeaderFooterAttrs(hf: XmlElement, req: EditHeaderFooterRequest): void {
  const set = (attr: string, val: string | undefined) => {
    if (val) setAttr(hf, attr, val);
  };
  set("FooterFirstPage", req.footerFirstPage);
  set("FooterVisible", req.footerVisible);
  set("HeaderFirstPage", req.headerFirstPage);
  set("HeaderVisible", req.headerVisible);
  set("StartingPage", req.startingPage);
}

/** Replaces an existing <HeaderAndFooter>'s Header/Footer paragraph content wholesale, when supplied. */
export function applyHeaderFooterParts(hf: XmlElement, req: EditHeaderFooterRequest): void {
  if (req.headerParts !== undefined) {
    const header = getOrCreateChild(hf, "Header");
    header.children = [buildHeaderParagraph(req.headerParts, false)];
  }
  if (req.footerParts !== undefined) {
    const footer = getOrCreateChild(hf, "Footer");
    footer.children = [buildHeaderParagraph(req.footerParts, true)];
  }
}

/** Validates every supplied part: exactly one of text/label per part, and only known labels. */
export function validateHeaderFooterParts(req: EditHeaderFooterRequest): string | undefined {
  for (const group of [req.headerParts ?? [], req.footerParts ?? []]) {
    for (const part of group) {
      const hasText = !!part.text;
      const hasLabel = !!part.label;
      if (hasText === hasLabel) return "each part must set either text or label, not both and not neither";
      if (hasLabel && !knownDynamicLabel(part.label!)) {
        return `invalid dynamic label: ${part.label} (must be one of: Page #, Date, Time, Script Title)`;
      }
    }
  }
  return undefined;
}
