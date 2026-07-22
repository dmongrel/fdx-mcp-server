// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSceneIndex } from "./get-scene-index.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("get_scene_index", () => {
  test("path is required", async () => {
    expect((await handleGetSceneIndex({})).isError).toBe(true);
  });

  test("returns the full scene catalog", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetSceneIndex({ path: FIXTURE_PATH });
    const scenes = JSON.parse(result.content[0]!.text);
    expect(Array.isArray(scenes)).toBe(true);
    expect(scenes.length).toBeGreaterThan(80);
    const first = scenes.find((s: any) => s.id === "3c4f7ca7-60ba-4af1-bf97-19c7c36151c5");
    expect(first).toBeDefined();
    expect(first.intro).toBe("EXT");
    expect(first.page).toBe(1);
  });

  test("rejects a non-section type filter", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetSceneIndex({ path: FIXTURE_PATH, type: "Action" });
    expect(result.isError).toBe(true);
  });

  test("filters by section type", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetSceneIndex({ path: FIXTURE_PATH, type: "Act&Scene Break" });
    const scenes = JSON.parse(result.content[0]!.text);
    expect(scenes.length).toBeGreaterThan(0);
    for (const s of scenes) expect(s.type).toBe("Act&Scene Break");
  });
});

