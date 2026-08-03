// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleGetFlaggedWords } from "./get-flagged-words.ts";
import { handleReadFdx } from "./read-fdx.ts";

function fixture(bodyXml: string, ignoredWords: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-flagged-words-"));
  const path = join(dir, "script.fdx");
  const ignoreXml = ignoredWords.length
    ? `<SpellCheckIgnoreLists><IgnoredWords>${ignoredWords.map((w) => `<Word>${w}</Word>`).join("")}</IgnoredWords></SpellCheckIgnoreLists>`
    : "";
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>${bodyXml}</Content>
  ${ignoreXml}
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}

function body(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[result.content.length - 1]!.text);
}

describe("get_flagged_words", () => {
  test("path is required", async () => {
    expect((await handleGetFlaggedWords(undefined)).isError).toBe(true);
  });

  test("reports a flagged run with paragraph id/type and page", async () => {
    const path = fixture(`
      <Paragraph Type="Scene Heading" id="sh1"><Text>INT. CAVE</Text>
        <SceneProperties Page="14"/>
      </Paragraph>
      <Paragraph Type="Dialogue" id="d1"><Text AdornmentStyle="-1">satys</Text></Paragraph>
    `);
    await handleReadFdx({ path });
    const result = await handleGetFlaggedWords({ path });
    expect(result.isError).toBeFalsy();
    const b = body(result);
    expect(b.count).toBe(1);
    expect(b.flaggedWords).toEqual([{ word: "satys", paragraphId: "d1", paragraphType: "Dialogue", page: 14 }]);
  });

  test("a run before any section heading gets a null page", async () => {
    const path = fixture(`<Paragraph Type="Action" id="a1"><Text AdornmentStyle="-1">Talpek</Text></Paragraph>`);
    await handleReadFdx({ path });
    const b = body(await handleGetFlaggedWords({ path }));
    expect((b.flaggedWords as Array<{ page: number | null }>)[0]!.page).toBeNull();
  });

  test("a styled but not flagged run is not reported", async () => {
    const path = fixture(`<Paragraph Type="Action" id="a1"><Text AdornmentStyle="1">Bold, not flagged.</Text></Paragraph>`);
    await handleReadFdx({ path });
    const b = body(await handleGetFlaggedWords({ path }));
    expect(b.flaggedWords).toEqual([]);
    expect(b.count).toBe(0);
  });

  test("no flagged words returns an empty list, not an error", async () => {
    const path = fixture(`<Paragraph Type="Action" id="a1"><Text>Plain.</Text></Paragraph>`);
    await handleReadFdx({ path });
    const result = await handleGetFlaggedWords({ path });
    expect(result.isError).toBeFalsy();
    expect(body(result)).toMatchObject({ flaggedWords: [], count: 0 });
  });

  test("excludeIgnoreList filters a word already in the ignore list, case-insensitively", async () => {
    const path = fixture(
      `<Paragraph Type="Action" id="a1"><Text AdornmentStyle="-1">Talpek</Text></Paragraph>`,
      ["talpek"],
    );
    await handleReadFdx({ path });
    const withFilter = body(await handleGetFlaggedWords({ path, excludeIgnoreList: true }));
    expect(withFilter.flaggedWords).toEqual([]);
    const without = body(await handleGetFlaggedWords({ path, excludeIgnoreList: false }));
    expect((without.flaggedWords as unknown[]).length).toBe(1);
  });
});

describe("get_flagged_words with a DualDialogue in the document", () => {
  test("reports the skipped-nested count", async () => {
    const path = fixture(`
      <Paragraph Type="Action" id="a1"><Text>Setup.</Text></Paragraph>
      <Paragraph Type="General" id="wrap1">
        <DualDialogue>
          <Paragraph Type="Character" id="c1"><Text>ALICE</Text></Paragraph>
          <Paragraph Type="Dialogue" id="d1"><Text>Hi.</Text></Paragraph>
        </DualDialogue>
      </Paragraph>
    `);
    await handleReadFdx({ path });
    const result = await handleGetFlaggedWords({ path });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain(
      "2 paragraph(s) nested inside a DualDialogue block were not scanned by this call.",
    );
  });

  test("no DualDialogue means no warning", async () => {
    const path = fixture(`<Paragraph Type="Action" id="a1"><Text>Plain.</Text></Paragraph>`);
    await handleReadFdx({ path });
    const result = await handleGetFlaggedWords({ path });
    expect(result.content[0]!.text).not.toContain("nested inside a DualDialogue");
  });
});
