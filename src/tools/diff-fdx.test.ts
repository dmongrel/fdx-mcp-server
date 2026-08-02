// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleDiffFdx } from "./diff-fdx.ts";

function fixture(paragraphsXml: string): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-diff-fdx-"));
  const path = join(dir, "script.fdx");
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>${paragraphsXml}</Content>
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}

function body(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[result.content.length - 1]!.text);
}

const P1 = '<Paragraph Type="Scene Heading" id="p1"><Text>INT. CAVE - NIGHT</Text></Paragraph>';
const P2 = '<Paragraph Type="Action" id="p2"><Text>A fire crackles.</Text></Paragraph>';
const P3 = '<Paragraph Type="Character" id="p3"><Text>GROG</Text></Paragraph>';

describe("diff_fdx", () => {
  test("pathA and pathB are required", async () => {
    expect((await handleDiffFdx({ pathB: "b.fdx" })).isError).toBe(true);
    expect((await handleDiffFdx({ pathA: "a.fdx" })).isError).toBe(true);
  });

  test("identical documents report everything unchanged", async () => {
    const pathA = fixture(P1 + P2 + P3);
    const pathB = fixture(P1 + P2 + P3);
    const result = await handleDiffFdx({ pathA, pathB });
    expect(result.isError).toBeFalsy();
    const b = body(result);
    expect(b.added).toEqual([]);
    expect(b.removed).toEqual([]);
    expect(b.modified).toEqual([]);
    expect(b.unchangedCount).toBe(3);
  });

  test("a paragraph only in B is added", async () => {
    const pathA = fixture(P1 + P2);
    const pathB = fixture(P1 + P2 + P3);
    const b = body(await handleDiffFdx({ pathA, pathB }));
    expect(b.added).toEqual([{ id: "p3", type: "Character", text: "GROG" }]);
    expect(b.removed).toEqual([]);
  });

  test("a paragraph only in A is removed", async () => {
    const pathA = fixture(P1 + P2 + P3);
    const pathB = fixture(P1 + P2);
    const b = body(await handleDiffFdx({ pathA, pathB }));
    expect(b.removed).toEqual([{ id: "p3", type: "Character", text: "GROG" }]);
    expect(b.added).toEqual([]);
  });

  test("a paragraph with the same id and changed text is modified", async () => {
    const pathA = fixture(P1 + '<Paragraph Type="Action" id="p2"><Text>Before text.</Text></Paragraph>');
    const pathB = fixture(P1 + '<Paragraph Type="Action" id="p2"><Text>After text.</Text></Paragraph>');
    const b = body(await handleDiffFdx({ pathA, pathB }));
    expect(b.modified).toEqual([
      { id: "p2", before: { type: "Action", text: "Before text." }, after: { type: "Action", text: "After text." } },
    ]);
  });

  test("a paragraph with the same id and changed type (same text) is modified", async () => {
    const pathA = fixture('<Paragraph Type="Action" id="p2"><Text>Same text.</Text></Paragraph>');
    const pathB = fixture('<Paragraph Type="Dialogue" id="p2"><Text>Same text.</Text></Paragraph>');
    const b = body(await handleDiffFdx({ pathA, pathB }));
    expect(b.modified).toEqual([
      { id: "p2", before: { type: "Action", text: "Same text." }, after: { type: "Dialogue", text: "Same text." } },
    ]);
  });

  test("a paragraph that only moved position is unchanged", async () => {
    const pathA = fixture(P1 + P2 + P3);
    const pathB = fixture(P3 + P1 + P2); // reordered, content identical
    const b = body(await handleDiffFdx({ pathA, pathB }));
    expect(b.added).toEqual([]);
    expect(b.removed).toEqual([]);
    expect(b.modified).toEqual([]);
    expect(b.unchangedCount).toBe(3);
  });

  test("summary counts match the lists' lengths", async () => {
    const pathA = fixture(P1 + P2 + P3);
    const pathB = fixture(P1 + '<Paragraph Type="Action" id="p2"><Text>changed</Text></Paragraph>');
    const b = body(await handleDiffFdx({ pathA, pathB }));
    expect((b.removed as unknown[]).length).toBe(1); // p3 gone
    expect((b.modified as unknown[]).length).toBe(1); // p2 changed
    expect(b.unchangedCount).toBe(1); // p1
  });
});
