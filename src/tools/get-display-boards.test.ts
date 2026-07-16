import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetDisplayBoards } from "./get-display-boards.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("get_display_boards", () => {
  test("path is required", async () => {
    expect((await handleGetDisplayBoards({})).isError).toBe(true);
  });

  test("returns the DisplayBoards block as JSON", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetDisplayBoards({ path: FIXTURE_PATH });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(Array.isArray(parsed.displayBoard)).toBe(true);
    const storyMap = parsed.displayBoard.find((b: any) => b.type === "StoryMap");
    expect(storyMap).toBeDefined();
    expect(Array.isArray(storyMap.lanes.lane)).toBe(true);
    expect(storyMap.lanes.lane.length).toBeGreaterThan(0);
  });
});
