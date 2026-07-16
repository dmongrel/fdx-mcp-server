import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSceneProperties } from "./get-scene-properties.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("get_scene_properties", () => {
  test("path is required", async () => {
    expect((await handleGetSceneProperties({ id: "x" })).isError).toBe(true);
  });

  test("id is required", async () => {
    expect((await handleGetSceneProperties({ path: FIXTURE_PATH })).isError).toBe(true);
  });

  test("returns parsed SceneProperties for a known id", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetSceneProperties({
      path: FIXTURE_PATH,
      id: "3c4f7ca7-60ba-4af1-bf97-19c7c36151c5",
    });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.page).toBe(1);
    expect(parsed.lengthEights).toBe(0.5);
    expect(parsed.color).toBe("#C0C0C0C0C0C0");
  });

  test("errors for an unknown paragraph id", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetSceneProperties({ path: FIXTURE_PATH, id: "nope" });
    expect(result.isError).toBe(true);
  });

  test("errors for a paragraph with no SceneProperties", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetSceneProperties({
      path: FIXTURE_PATH,
      id: "bfcd8edf-24c1-4f38-9b48-4f5f8f06757c",
    });
    expect(result.isError).toBe(true);
  });
});
