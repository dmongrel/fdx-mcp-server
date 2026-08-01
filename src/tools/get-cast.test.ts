// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetCast } from "./get-cast.ts";

function fixtureWithCast(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-get-cast-"));
  const path = join(dir, "script.fdx");
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1"><Text>EXT. BRIDGE - DAY</Text></Paragraph>
    <Paragraph Type="Character" id="c1"><Text>DAK'LEN</Text></Paragraph>
  </Content>
  <Actors>
    <Actor MacVoice="" Name="Man 1" Pitch="Normal" Speed="Medium" WinVoice="‘Q|Çg(Ð„{DEST"/>
    <Actor MacVoice="" Name="Old Man" Pitch="Normal" Speed="Medium" WinVoice=""/>
  </Actors>
  <Cast>
    <Narrator Actor="Man 1">
      <Element Type="Character"/>
      <Element Type="Dialogue"/>
    </Narrator>
    <Member Actor="Old Man" Character="DAK'LEN"/>
    <Member Actor="Man 1" Character="DANAERIAN COMMANDER"/>
  </Cast>
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}

describe("get_cast", () => {
  test("path is required", async () => {
    expect((await handleGetCast({})).isError).toBe(true);
  });

  test("returns the Narrator and every Member row, without exposing Actors data", async () => {
    const path = fixtureWithCast();
    await handleReadFdx({ path });
    const result = await handleGetCast({ path });
    const body = JSON.parse(result.content[0]!.text);

    expect(body.narrator).toEqual({ actor: "Man 1", elements: ["Character", "Dialogue"] });
    expect(body.members).toEqual([
      { character: "DAK'LEN", actor: "Old Man" },
      { character: "DANAERIAN COMMANDER", actor: "Man 1" },
    ]);
    expect(result.content[0]!.text).not.toContain("WinVoice");
  });

  test("returns null narrator and empty members for a document with no <Cast>", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fdx-get-cast-none-"));
    const path = join(dir, "script.fdx");
    writeFileSync(
      path,
      `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<FinalDraft Version="6"><Content/></FinalDraft>`,
      "utf-8",
    );
    await handleReadFdx({ path });
    const result = await handleGetCast({ path });
    const body = JSON.parse(result.content[0]!.text);
    expect(body.narrator).toBeNull();
    expect(body.members).toEqual([]);
  });
});
