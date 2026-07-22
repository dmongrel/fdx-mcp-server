// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSceneArcBeats } from "./get-scene-arc-beats.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

// The shared fixture has no SceneProperties/arc-beat data (no edit_* tool writes it), so this
// needs a handcrafted document that actually has some.
function fixtureWithArcBeats(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-get-scene-arc-beats-"));
  const path = join(dir, "script.fdx");
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1">
      <Text>EXT. BRIDGE - DAY</Text>
      <SceneProperties>
        <SceneArcBeats>
          <CharacterArcBeat Name="TALPEK">
            <Paragraph Type="General" id="n1"><Text>note one</Text></Paragraph>
          </CharacterArcBeat>
        </SceneArcBeats>
      </SceneProperties>
    </Paragraph>
    <Paragraph Type="Scene Heading" id="sh2">
      <Text>INT. BRIDGE - NIGHT</Text>
      <SceneProperties/>
    </Paragraph>
  </Content>
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}

describe("get_scene_arc_beats", () => {
  test("path is required", async () => {
    expect((await handleGetSceneArcBeats({})).isError).toBe(true);
  });

  test("returns only scenes with at least one beat", async () => {
    const path = fixtureWithArcBeats();
    await handleReadFdx({ path });
    const result = await handleGetSceneArcBeats({ path });
    const arcs = JSON.parse(result.content[0]!.text);
    expect(Array.isArray(arcs)).toBe(true);
    expect(arcs.length).toBeGreaterThan(0);
    for (const a of arcs) expect(a.beats.length).toBeGreaterThan(0);
    expect(arcs.some((a: any) => a.beats.some((b: any) => b.name === "TALPEK"))).toBe(true);
  });

  test("returns an empty list when the fixture has no arc-beat data", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetSceneArcBeats({ path: FIXTURE_PATH });
    expect(JSON.parse(result.content[0]!.text)).toEqual([]);
  });
});

