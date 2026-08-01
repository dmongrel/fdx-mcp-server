// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSceneArcBeats } from "./get-scene-arc-beats.ts";
import { handleEditSceneArcBeats } from "./edit-scene-arc-beats.ts";

function fixtureWithArcBeats(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-scene-arc-beats-"));
  const path = join(dir, "script.fdx");
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1">
      <Text>INT. MOUNTAIN STRONGHOLD ENTRANCE</Text>
      <SceneProperties>
        <SceneArcBeats>
          <CharacterArcBeat Name="DANAERIAN COMMANDER">
            <Paragraph Type="General" id="n1"><Text>note one</Text></Paragraph>
          </CharacterArcBeat>
          <CharacterArcBeat Name="GIMAN-DOL COMMANDER">
            <Paragraph Type="General" id="n2"><Text>note two</Text></Paragraph>
          </CharacterArcBeat>
        </SceneArcBeats>
      </SceneProperties>
    </Paragraph>
    <Paragraph Type="Scene Heading" id="sh2">
      <Text>EXT. BRIDGE - DAY</Text>
      <SceneProperties>
        <SceneArcBeats>
          <CharacterArcBeat Name="DANAERIAN COMMANDER">
            <Paragraph Type="General" id="n3"><Text>note three</Text></Paragraph>
          </CharacterArcBeat>
        </SceneArcBeats>
      </SceneProperties>
    </Paragraph>
  </Content>
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}

async function beatsFor(path: string, sceneId: string): Promise<string[]> {
  const arcs = JSON.parse((await handleGetSceneArcBeats({ path })).content[0]!.text);
  const scene = arcs.find((a: any) => a.sceneId === sceneId);
  return scene ? scene.beats.map((b: any) => b.name) : [];
}

describe("edit_scene_arc_beats", () => {
  test("path/action/name are required", async () => {
    expect((await handleEditSceneArcBeats({})).isError).toBe(true);
    const path = fixtureWithArcBeats();
    await handleReadFdx({ path });
    expect((await handleEditSceneArcBeats({ path, name: "X" })).isError).toBe(true);
    expect((await handleEditSceneArcBeats({ path, action: "edit" })).isError).toBe(true);
  });

  test("edit requires newName", async () => {
    const path = fixtureWithArcBeats();
    await handleReadFdx({ path });
    const result = await handleEditSceneArcBeats({ path, action: "edit", name: "DANAERIAN COMMANDER" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("newName");
  });

  test("edit renames matching beats across every scene when id is omitted", async () => {
    const path = fixtureWithArcBeats();
    await handleReadFdx({ path });

    const result = await handleEditSceneArcBeats({
      path,
      action: "edit",
      name: "DANAERIAN COMMANDER",
      newName: "GIMAN-DOL COMMANDER",
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("2 arc beat(s) across 2 scene(s)");

    expect(await beatsFor(path, "sh1")).toEqual(["GIMAN-DOL COMMANDER", "GIMAN-DOL COMMANDER"]);
    expect(await beatsFor(path, "sh2")).toEqual(["GIMAN-DOL COMMANDER"]);
  });

  test("edit scoped to id only touches that scene", async () => {
    const path = fixtureWithArcBeats();
    await handleReadFdx({ path });

    const result = await handleEditSceneArcBeats({
      path,
      action: "edit",
      name: "DANAERIAN COMMANDER",
      newName: "GIMAN-DOL COMMANDER",
      id: "sh1",
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("1 arc beat(s) across 1 scene(s)");

    expect(await beatsFor(path, "sh1")).toEqual(["GIMAN-DOL COMMANDER", "GIMAN-DOL COMMANDER"]);
    expect(await beatsFor(path, "sh2")).toEqual(["DANAERIAN COMMANDER"]);
  });

  test("remove deletes matching beats and collapses the duplicate-tracking case from the repro", async () => {
    const path = fixtureWithArcBeats();
    await handleReadFdx({ path });

    const result = await handleEditSceneArcBeats({ path, action: "remove", name: "DANAERIAN COMMANDER" });
    expect(result.isError).toBeFalsy();

    expect(await beatsFor(path, "sh1")).toEqual(["GIMAN-DOL COMMANDER"]);
    expect(await beatsFor(path, "sh2")).toEqual([]);
  });

  test("an unknown scene id fails", async () => {
    const path = fixtureWithArcBeats();
    await handleReadFdx({ path });
    const result = await handleEditSceneArcBeats({ path, action: "remove", name: "X", id: "does-not-exist" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("scene id not found");
  });

  test("a name with no matching beats fails", async () => {
    const path = fixtureWithArcBeats();
    await handleReadFdx({ path });
    const result = await handleEditSceneArcBeats({ path, action: "remove", name: "NOBODY" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("no CharacterArcBeat found");
  });

  test("caseSensitive matching via cs", async () => {
    const path = fixtureWithArcBeats();
    await handleReadFdx({ path });
    const result = await handleEditSceneArcBeats({ path, action: "remove", name: "danaerian commander", cs: true });
    expect(result.isError).toBe(true);
  });
});
