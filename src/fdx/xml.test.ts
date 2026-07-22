// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { parseXml, serializeXml, getAttr, setAttr, findChild, findChildren, textContent } from "./xml.ts";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="6">
  <DocumentRef DateTime="20260630T105310" id="abc">
    <XRef DateTime="20260630T101437" id="def"/>
  </DocumentRef>
  <Content>
    <Paragraph Type="Act&amp;Scene Break" id="p1">
      <Text>PROLOGUE</Text>
    </Paragraph>
    <Paragraph Type="Action" id="p2">
      <Text>SUPER - </Text>
      <Text AdornmentStyle="-1">GIMAN-DOL</Text>
      <Text> IV</Text>
    </Paragraph>
  </Content>
</FinalDraft>
`;

describe("xml parser/serializer", () => {
  test("parses the root element and attrs", () => {
    const { root } = parseXml(SAMPLE);
    expect(root.name).toBe("FinalDraft");
    expect(getAttr(root, "Version")).toBe("6");
    expect(getAttr(root, "DocumentType")).toBe("Script");
  });

  test("decodes entities in attribute values", () => {
    const { root } = parseXml(SAMPLE);
    const content = findChild(root, "Content")!;
    const paragraphs = findChildren(content, "Paragraph");
    expect(getAttr(paragraphs[0]!, "Type")).toBe("Act&Scene Break");
  });

  test("preserves multiple Text runs in document order", () => {
    const { root } = parseXml(SAMPLE);
    const content = findChild(root, "Content")!;
    const paragraphs = findChildren(content, "Paragraph");
    const texts = findChildren(paragraphs[1]!, "Text");
    expect(texts).toHaveLength(3);
    expect(textContent(texts[0]!)).toBe("SUPER - ");
    expect(getAttr(texts[1]!, "AdornmentStyle")).toBe("-1");
    expect(textContent(texts[2]!)).toBe(" IV");
  });

  test("self-closing elements round-trip with no children", () => {
    const { root } = parseXml(SAMPLE);
    const docRef = findChild(root, "DocumentRef")!;
    const xref = findChild(docRef, "XRef")!;
    expect(xref.children).toHaveLength(0);
  });

  test("re-encodes entities on serialize", () => {
    const doc = parseXml(SAMPLE);
    const content = findChild(doc.root, "Content")!;
    const paragraphs = findChildren(content, "Paragraph");
    const out = serializeXml(doc);
    expect(out).toContain('Type="Act&amp;Scene Break"');
    expect(paragraphs).toHaveLength(2);
  });

  test("mutating an attribute and re-serializing reflects the change", () => {
    const doc = parseXml(SAMPLE);
    setAttr(doc.root, "Version", "7");
    const out = serializeXml(doc);
    expect(out).toContain('Version="7"');
    expect(out).not.toContain('Version="6"');
  });

  test("preserves the XML declaration verbatim", () => {
    const doc = parseXml(SAMPLE);
    const out = serializeXml(doc);
    expect(out.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="no" ?>')).toBe(true);
  });
});

