// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSceneIndex } from "./get-scene-index.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

describe("get_scene_index", () => {
  test("path is required", async () => {
    expect((await handleGetSceneIndex({})).isError).toBe(true);
  });

  test("returns the full scene catalog", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetSceneIndex({ path: FIXTURE_PATH });
    const scenes = JSON.parse(result.content[0]!.text);
    expect(Array.isArray(scenes)).toBe(true);
    expect(scenes.length).toBe(7);
    const first = scenes.find((s: any) => s.id === "6e39d99f-6972-42f8-bdc8-3f0dbe546280");
    expect(first).toBeDefined();
    expect(first.intro).toBe("EXT");
  });

  test("rejects a non-section type filter", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetSceneIndex({ path: FIXTURE_PATH, type: "Action" });
    expect(result.isError).toBe(true);
  });

  test("filters by section type", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetSceneIndex({ path: FIXTURE_PATH, type: "Scene Heading" });
    const scenes = JSON.parse(result.content[0]!.text);
    expect(scenes.length).toBe(6);
    for (const s of scenes) expect(s.type).toBe("Scene Heading");
  });
});

