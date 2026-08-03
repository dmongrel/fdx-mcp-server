// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSceneProperties } from "./get-scene-properties.ts";
import { handleEditSceneProperties } from "./edit-scene-properties.ts";

function fixture(sceneXml: string): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-scene-properties-"));
  const path = join(dir, "script.fdx");
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>${sceneXml}</Content>
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}

const NO_SCENE_PROPERTIES = `<Paragraph Type="Scene Heading" id="sh1"><Text>EXT. BRIDGE - DAY</Text></Paragraph>`;

const WITH_SCENE_PROPERTIES = `<Paragraph Type="Scene Heading" id="sh1">
  <Text>EXT. BRIDGE - DAY</Text>
  <SceneProperties Color="#C0C0C0C0C0C0" Length="4/8" Page="1"/>
</Paragraph>`;

describe("edit_scene_properties", () => {
  test("path/id are required", async () => {
    expect((await handleEditSceneProperties({ id: "sh1", color: "#000000000000" })).isError).toBe(true);
    const path = fixture(NO_SCENE_PROPERTIES);
    await handleReadFdx({ path });
    expect((await handleEditSceneProperties({ path, color: "#000000000000" })).isError).toBe(true);
  });

  test("errors when neither color nor title is given", async () => {
    const path = fixture(NO_SCENE_PROPERTIES);
    await handleReadFdx({ path });
    const result = await handleEditSceneProperties({ path, id: "sh1" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("color or title");
  });

  test("errors on an unknown id", async () => {
    const path = fixture(NO_SCENE_PROPERTIES);
    await handleReadFdx({ path });
    const result = await handleEditSceneProperties({ path, id: "nope", color: "#000000000000" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("paragraph id not found");
  });

  test("sets color on a paragraph with no existing SceneProperties, creating the block", async () => {
    const path = fixture(NO_SCENE_PROPERTIES);
    await handleReadFdx({ path });
    const result = await handleEditSceneProperties({ path, id: "sh1", color: "#6363A7A7EFEF" });
    expect(result.isError).toBeFalsy();

    const getResult = await handleGetSceneProperties({ path, id: "sh1" });
    const props = JSON.parse(getResult.content[getResult.content.length - 1]!.text);
    expect(props.color).toBe("#6363A7A7EFEF");
    expect(props.length).toBe("");
  });

  test("sets color on a paragraph that already has SceneProperties, leaving length/page untouched", async () => {
    const path = fixture(WITH_SCENE_PROPERTIES);
    await handleReadFdx({ path });
    const result = await handleEditSceneProperties({ path, id: "sh1", color: "#6363A7A7EFEF" });
    expect(result.isError).toBeFalsy();

    const getResult = await handleGetSceneProperties({ path, id: "sh1" });
    const props = JSON.parse(getResult.content[getResult.content.length - 1]!.text);
    expect(props.color).toBe("#6363A7A7EFEF");
    expect(props.length).toBe("4/8");
    expect(props.page).toBe(1);
  });

  test("sets title only", async () => {
    const path = fixture(NO_SCENE_PROPERTIES);
    await handleReadFdx({ path });
    const result = await handleEditSceneProperties({ path, id: "sh1", title: "The Bridge Scene" });
    expect(result.isError).toBeFalsy();

    const getResult = await handleGetSceneProperties({ path, id: "sh1" });
    const props = JSON.parse(getResult.content[getResult.content.length - 1]!.text);
    expect(props.title).toBe("The Bridge Scene");
  });

  test("sets both color and title in one call", async () => {
    const path = fixture(NO_SCENE_PROPERTIES);
    await handleReadFdx({ path });
    const result = await handleEditSceneProperties({
      path,
      id: "sh1",
      color: "#6363A7A7EFEF",
      title: "The Bridge Scene",
    });
    expect(result.isError).toBeFalsy();

    const getResult = await handleGetSceneProperties({ path, id: "sh1" });
    const props = JSON.parse(getResult.content[getResult.content.length - 1]!.text);
    expect(props.color).toBe("#6363A7A7EFEF");
    expect(props.title).toBe("The Bridge Scene");
  });
});
