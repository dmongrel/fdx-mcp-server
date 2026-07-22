// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * Minimal, dependency-free XML parser/serializer tuned for FinalDraft .fdx documents.
 *
 * FinalDraft's XML never uses CDATA sections and only uses the five standard XML entities plus
 * numeric character references, so this parser targets that subset rather than being a fully
 * general-purpose XML engine. It preserves element/attribute order and round-trips comments,
 * so any part of the document this server does not model in detail still survives a
 * parse -> mutate (elsewhere) -> serialize cycle byte-equivalent apart from re-encoding.
 */

export interface XmlElement {
  type: "element";
  name: string;
  attrs: Array<[string, string]>;
  children: XmlNode[];
}

export interface XmlText {
  type: "text";
  value: string;
}

export interface XmlComment {
  type: "comment";
  value: string;
}

export type XmlNode = XmlElement | XmlText | XmlComment;

export interface ParsedXmlDocument {
  declaration: string;
  root: XmlElement;
}

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(raw: string): string {
  if (!raw.includes("&")) return raw;
  return raw.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const num = isHex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (Number.isNaN(num)) return whole;
      return String.fromCodePoint(num);
    }
    return ENTITY_MAP[body] ?? whole;
  });
}

export function encodeText(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function encodeAttr(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

class Cursor {
  constructor(
    public src: string,
    public i = 0,
  ) {}
  eof(): boolean {
    return this.i >= this.src.length;
  }
  peek(n = 0): string {
    return this.src[this.i + n] ?? "";
  }
  startsWith(s: string): boolean {
    return this.src.startsWith(s, this.i);
  }
  skipWhitespace(): void {
    while (!this.eof() && /\s/.test(this.peek())) this.i++;
  }
}

function parseAttrs(cursor: Cursor): Array<[string, string]> {
  const attrs: Array<[string, string]> = [];
  for (;;) {
    cursor.skipWhitespace();
    const c = cursor.peek();
    if (c === "" || c === ">" || c === "/" || (c === "?" && cursor.peek(1) === ">")) break;
    const nameStart = cursor.i;
    while (!cursor.eof() && /[^\s=/>]/.test(cursor.peek())) cursor.i++;
    const name = cursor.src.slice(nameStart, cursor.i);
    if (!name) break;
    cursor.skipWhitespace();
    let value = "";
    if (cursor.peek() === "=") {
      cursor.i++; // consume '='
      cursor.skipWhitespace();
      const quote = cursor.peek();
      if (quote === '"' || quote === "'") {
        cursor.i++;
        const valStart = cursor.i;
        while (!cursor.eof() && cursor.peek() !== quote) cursor.i++;
        value = decodeEntities(cursor.src.slice(valStart, cursor.i));
        cursor.i++; // consume closing quote
      }
    }
    attrs.push([name, value]);
  }
  return attrs;
}

/** Parses an XML document into a declaration string plus a single root element tree. */
export function parseXml(source: string): ParsedXmlDocument {
  const cursor = new Cursor(source);
  let declaration = "";

  cursor.skipWhitespace();
  if (cursor.startsWith("<?xml")) {
    const end = cursor.src.indexOf("?>", cursor.i);
    if (end === -1) throw new Error("Malformed XML declaration: missing '?>'");
    declaration = cursor.src.slice(cursor.i, end + 2);
    cursor.i = end + 2;
  }

  const root = parseElementOrSkip(cursor);
  if (!root) throw new Error("No root element found in XML document");
  return { declaration, root };
}

function parseElementOrSkip(cursor: Cursor): XmlElement | null {
  for (;;) {
    cursor.skipWhitespace();
    if (cursor.eof()) return null;
    if (cursor.startsWith("<!--")) {
      cursor.i += 4;
      cursor.i = cursor.src.indexOf("-->", cursor.i) + 3;
      continue;
    }
    if (cursor.startsWith("<!") || cursor.startsWith("<?")) {
      // DOCTYPE or processing instruction: skip to matching '>'.
      const end = cursor.src.indexOf(">", cursor.i);
      cursor.i = end === -1 ? cursor.src.length : end + 1;
      continue;
    }
    if (cursor.peek() === "<") {
      return parseElement(cursor);
    }
    return null;
  }
}

function parseElement(cursor: Cursor): XmlElement {
  // Expect cursor at '<'.
  cursor.i++; // consume '<'
  const nameStart = cursor.i;
  while (!cursor.eof() && /[^\s/>]/.test(cursor.peek())) cursor.i++;
  const name = cursor.src.slice(nameStart, cursor.i);
  const attrs = parseAttrs(cursor);
  cursor.skipWhitespace();

  if (cursor.peek() === "/" && cursor.peek(1) === ">") {
    cursor.i += 2;
    return { type: "element", name, attrs, children: [] };
  }
  if (cursor.peek() !== ">") {
    throw new Error(`Malformed tag <${name}> near offset ${cursor.i}`);
  }
  cursor.i++; // consume '>'

  const children: XmlNode[] = [];
  const closeTag = `</${name}>`;

  for (;;) {
    if (cursor.eof()) throw new Error(`Unclosed element <${name}>`);
    if (cursor.startsWith(closeTag)) {
      cursor.i += closeTag.length;
      break;
    }
    if (cursor.startsWith("</")) {
      // Mismatched close tag — consume it defensively to avoid an infinite loop.
      const end = cursor.src.indexOf(">", cursor.i);
      cursor.i = end === -1 ? cursor.src.length : end + 1;
      break;
    }
    if (cursor.startsWith("<!--")) {
      const start = cursor.i + 4;
      const end = cursor.src.indexOf("-->", start);
      const value = end === -1 ? cursor.src.slice(start) : cursor.src.slice(start, end);
      children.push({ type: "comment", value });
      cursor.i = end === -1 ? cursor.src.length : end + 3;
      continue;
    }
    if (cursor.startsWith("<![CDATA[")) {
      const start = cursor.i + 9;
      const end = cursor.src.indexOf("]]>", start);
      const value = end === -1 ? cursor.src.slice(start) : cursor.src.slice(start, end);
      children.push({ type: "text", value });
      cursor.i = end === -1 ? cursor.src.length : end + 3;
      continue;
    }
    if (cursor.peek() === "<") {
      children.push(parseElement(cursor));
      continue;
    }
    // Text run up to the next '<'.
    const start = cursor.i;
    const nextLt = cursor.src.indexOf("<", cursor.i);
    cursor.i = nextLt === -1 ? cursor.src.length : nextLt;
    const raw = cursor.src.slice(start, cursor.i);
    children.push({ type: "text", value: decodeEntities(raw) });
  }

  return { type: "element", name, attrs, children: pruneInsignificantWhitespace(children) };
}

/**
 * Drops whitespace-only text nodes from an element's children when it also has element children.
 * Such text is pure indentation/formatting from the source file, not meaningful content — and
 * serializeElement's own pretty-printer (see below) generates fresh indentation/newlines for that
 * exact case. Keeping the original whitespace nodes around made serialize() non-idempotent: each
 * parse -> serialize cycle would print the pretty-printer's own newline *and* the preserved
 * original whitespace, so the file grew a little on every read/edit/save round trip. Text-only
 * (leaf) elements are untouched, so real content — including a lone space inside a <Text> run —
 * still round-trips exactly.
 */
function pruneInsignificantWhitespace(children: XmlNode[]): XmlNode[] {
  const hasElementChild = children.some((c) => c.type === "element");
  if (!hasElementChild) return children;
  return children.filter((c) => !(c.type === "text" && /^\s*$/.test(c.value)));
}

/** Serializes a parsed document back to an XML string, preserving the original declaration. */
export function serializeXml(doc: ParsedXmlDocument): string {
  const parts: string[] = [];
  if (doc.declaration) parts.push(doc.declaration, "\n");
  serializeNode(doc.root, parts, 0);
  return parts.join("");
}

/** Serializes a single node (and its subtree) standalone, indented from `depth` (default 0). */
export function serializeNodeStandalone(node: XmlNode, depth = 0): string {
  const parts: string[] = [];
  serializeNode(node, parts, depth);
  return parts.join("");
}

const INDENT = "  ";

function serializeNode(node: XmlNode, out: string[], depth: number): void {
  if (node.type === "text") {
    out.push(encodeText(node.value));
    return;
  }
  if (node.type === "comment") {
    out.push(`<!--${node.value}-->`);
    return;
  }
  serializeElement(node, out, depth);
}

function serializeElement(el: XmlElement, out: string[], depth: number): void {
  const indent = INDENT.repeat(depth);
  out.push(indent, "<", el.name);
  for (const [k, v] of el.attrs) {
    out.push(" ", k, '="', encodeAttr(v), '"');
  }

  if (el.children.length === 0) {
    out.push("/>");
    return;
  }

  // Mixed/text-only content is written inline without extra indentation/newlines so text nodes
  // (paragraph runs, leaf dictionary entries) round-trip exactly as FinalDraft writes them.
  const hasElementChild = el.children.some((c) => c.type === "element");
  if (!hasElementChild) {
    out.push(">");
    for (const child of el.children) serializeNode(child, out, 0);
    out.push("</", el.name, ">");
    return;
  }

  out.push(">\n");
  for (const child of el.children) {
    serializeNode(child, out, depth + 1);
    out.push("\n");
  }
  out.push(indent, "</", el.name, ">");
}

/* ------------------------------------------------------------------ */
/*  Small traversal/mutation helpers shared across the fdx model       */
/* ------------------------------------------------------------------ */

export function createElement(
  name: string,
  attrs: Array<[string, string]> = [],
  children: XmlNode[] = [],
): XmlElement {
  return { type: "element", name, attrs, children };
}

export function getAttr(el: XmlElement, name: string): string | undefined {
  return el.attrs.find(([k]) => k === name)?.[1];
}

export function setAttr(el: XmlElement, name: string, value: string): void {
  const existing = el.attrs.find((a) => a[0] === name);
  if (existing) {
    existing[1] = value;
  } else {
    el.attrs.push([name, value]);
  }
}

export function removeAttr(el: XmlElement, name: string): void {
  const idx = el.attrs.findIndex((a) => a[0] === name);
  if (idx !== -1) el.attrs.splice(idx, 1);
}

export function findChild(el: XmlElement, name: string): XmlElement | undefined {
  return el.children.find((c): c is XmlElement => c.type === "element" && c.name === name);
}

export function findChildren(el: XmlElement, name: string): XmlElement[] {
  return el.children.filter((c): c is XmlElement => c.type === "element" && c.name === name);
}

/** Returns or creates (if `create`) the single named child element. */
export function getOrCreateChild(el: XmlElement, name: string): XmlElement {
  let child = findChild(el, name);
  if (!child) {
    child = createElement(name);
    el.children.push(child);
  }
  return child;
}

/** Concatenates all direct text-node children (ignores nested elements). */
export function textContent(el: XmlElement): string {
  return el.children
    .filter((c): c is XmlText => c.type === "text")
    .map((c) => c.value)
    .join("");
}

/** Replaces all children with a single text node carrying `value`. */
export function setTextContent(el: XmlElement, value: string): void {
  el.children = value === "" ? [] : [{ type: "text", value }];
}

/** Deep-clones an XML node tree (used by new_file to avoid sharing state across documents). */
export function cloneNode<T extends XmlNode>(node: T): T {
  if (node.type !== "element") return { ...node };
  return {
    type: "element",
    name: node.name,
    attrs: node.attrs.map(([k, v]) => [k, v]),
    children: node.children.map((c) => cloneNode(c)),
  } as T;
}

