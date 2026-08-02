// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleGetPlaceholders } from "./get-placeholders.ts";
import { handleReadFdx } from "./read-fdx.ts";

function fixture(bodyXml: string): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-placeholders-"));
  const path = join(dir, "script.fdx");
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>${bodyXml}</Content>
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}

function body(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[result.content.length - 1]!.text);
}

describe("get_placeholders", () => {
  test("path is required", async () => {
    expect((await handleGetPlaceholders(undefined)).isError).toBe(true);
  });

  test("reports a whole-bracket paragraph with id/type and page", async () => {
    const path = fixture(`
      <Paragraph Type="Scene Heading" id="sh1"><Text>INT. CAVE</Text>
        <SceneProperties Page="14"/>
      </Paragraph>
      <Paragraph Type="General" id="p1"><Text>[FIX - move this scene earlier]</Text></Paragraph>
    `);
    await handleReadFdx({ path });
    const result = await handleGetPlaceholders({ path });
    expect(result.isError).toBeFalsy();
    const b = body(result);
    expect(b.count).toBe(1);
    expect(b.placeholders).toEqual([
      { id: "p1", type: "General", text: "[FIX - move this scene earlier]", page: 14 },
    ]);
  });

  test("a placeholder before any section heading gets a null page", async () => {
    const path = fixture(`<Paragraph Type="General" id="p1"><Text>[FIX - x]</Text></Paragraph>`);
    await handleReadFdx({ path });
    const b = body(await handleGetPlaceholders({ path }));
    expect((b.placeholders as Array<{ page: number | null }>)[0]!.page).toBeNull();
  });

  test("a bracket alongside real content is not reported", async () => {
    const path = fixture(`<Paragraph Type="Action" id="a1"><Text>INT. CAVE - DAY [FIX - check slug]</Text></Paragraph>`);
    await handleReadFdx({ path });
    const b = body(await handleGetPlaceholders({ path }));
    expect(b.placeholders).toEqual([]);
    expect(b.count).toBe(0);
  });

  test("matches regardless of paragraph type", async () => {
    const path = fixture(`<Paragraph Type="Dialogue" id="d1"><Text>[NOTE: check timing]</Text></Paragraph>`);
    await handleReadFdx({ path });
    const b = body(await handleGetPlaceholders({ path }));
    expect(b.count).toBe(1);
  });

  test("no placeholders returns an empty list, not an error", async () => {
    const path = fixture(`<Paragraph Type="Action" id="a1"><Text>Grog picks up a rock.</Text></Paragraph>`);
    await handleReadFdx({ path });
    const result = await handleGetPlaceholders({ path });
    expect(result.isError).toBeFalsy();
    expect(body(result)).toMatchObject({ placeholders: [], count: 0 });
  });
});
