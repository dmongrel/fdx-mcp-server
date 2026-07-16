import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FdxDocument } from "./document.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");
const fixture = readFileSync(FIXTURE_PATH, "utf-8");

describe("FdxDocument", () => {
  test("parses the fixture and reports its FinalDraft version", () => {
    const doc = FdxDocument.parse(fixture);
    expect(doc.version).toBe("6");
  });

  test("getParagraphElements returns top-level body paragraphs", () => {
    const doc = FdxDocument.parse(fixture);
    const paragraphs = doc.getParagraphElements();
    expect(paragraphs.length).toBeGreaterThan(0);
    expect(paragraphs[0]!.name).toBe("Paragraph");
  });

  test("round-trips through serialize without losing paragraph count", () => {
    const doc = FdxDocument.parse(fixture);
    const before = doc.getParagraphElements().length;
    const reparsed = FdxDocument.parse(doc.serialize());
    expect(reparsed.getParagraphElements().length).toBe(before);
  });

  test("touchDocumentRef updates the DateTime attribute", () => {
    const doc = FdxDocument.parse(fixture);
    const before = doc.serialize().match(/<DocumentRef[^>]*DateTime="(\d{8}T\d{6})"/)?.[1];
    doc.touchDocumentRef(new Date(2030, 0, 2, 3, 4, 5));
    const after = doc.serialize().match(/<DocumentRef[^>]*DateTime="(\d{8}T\d{6})"/)?.[1];
    expect(after).toBe("20300102T030405");
    expect(after).not.toBe(before);
  });

  test("dedupSmartTypeLists removes exact-match duplicates and sorts case-insensitively", () => {
    const doc = FdxDocument.parse(fixture);
    doc.setSmartTypeList("Location", ["Zebra", "apple", "apple", "banana"]);
    doc.dedupSmartTypeLists();
    const list = doc.getSmartTypeList("Location")!;
    expect(list.values).toEqual(["apple", "banana", "Zebra"]);
  });

  test("dedupSmartTypeLists preserves entries that differ only in case", () => {
    const doc = FdxDocument.parse(fixture);
    doc.setSmartTypeList("Location", ["apple", "Apple"]);
    doc.dedupSmartTypeLists();
    const list = doc.getSmartTypeList("Location")!;
    expect(list.values).toHaveLength(2);
    expect(new Set(list.values)).toEqual(new Set(["apple", "Apple"]));
  });

  test("getSmartTypeList / setSmartTypeList round-trip through serialize", () => {
    const doc = FdxDocument.parse(fixture);
    doc.setSmartTypeList("Character", ["KIRK", "SPOCK"]);
    const reparsed = FdxDocument.parse(doc.serialize());
    expect(reparsed.getSmartTypeList("Character")!.values).toEqual(["KIRK", "SPOCK"]);
  });

  test("setIgnoredWords / getIgnoredWords round-trip", () => {
    const doc = FdxDocument.parse(fixture);
    doc.setIgnoredWords(["FOOBAR", "GIMAN-DOL"]);
    const reparsed = FdxDocument.parse(doc.serialize());
    expect(reparsed.getIgnoredWords()).toEqual(["FOOBAR", "GIMAN-DOL"]);
  });

  test("consolidateSpellCheckWords harvests nested DualDialogue words into the top-level list", () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="General" id="p1">
      <DualDialogue>
        <SpellCheckIgnoreLists>
          <IgnoredWords>
            <Word>NESTEDWORD</Word>
          </IgnoredWords>
        </SpellCheckIgnoreLists>
        <Paragraph Type="Character" id="p2"><Text>KIRK</Text></Paragraph>
      </DualDialogue>
    </Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const moved = doc.consolidateSpellCheckWords();
    expect(moved).toBe(1);
    expect(doc.getIgnoredWords()).toEqual(["NESTEDWORD"]);
    expect(doc.serialize()).not.toContain("NESTEDWORD</Word>\n          </IgnoredWords>\n        </SpellCheckIgnoreLists>");
  });

  test("consolidateSpellCheckWords is a no-op when there is nothing nested", () => {
    const doc = FdxDocument.parse(fixture);
    expect(doc.consolidateSpellCheckWords()).toBe(0);
  });
});
