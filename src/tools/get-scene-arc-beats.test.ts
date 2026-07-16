import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSceneArcBeats } from "./get-scene-arc-beats.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("get_scene_arc_beats", () => {
  test("path is required", async () => {
    expect((await handleGetSceneArcBeats({})).isError).toBe(true);
  });

  test("returns only scenes with at least one beat", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetSceneArcBeats({ path: FIXTURE_PATH });
    const arcs = JSON.parse(result.content[0]!.text);
    expect(Array.isArray(arcs)).toBe(true);
    expect(arcs.length).toBeGreaterThan(0);
    for (const a of arcs) expect(a.beats.length).toBeGreaterThan(0);
    expect(arcs.some((a: any) => a.beats.some((b: any) => b.name === "TALPEK"))).toBe(true);
  });
});
