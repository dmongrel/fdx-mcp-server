// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetLocations } from "./get-locations.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

describe("get_locations", () => {
  test("path is required", async () => {
    expect((await handleGetLocations({})).isError).toBe(true);
  });

  test("returns every location used in Scene Headings, ranked by scene count", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetLocations({ path: FIXTURE_PATH });
    expect(result.isError).toBeFalsy();
    const groups = JSON.parse(result.content[0]!.text);
    const valley = groups.find((g: { location: string }) => g.location === "PREHISTORIC VALLEY");
    const cave = groups.find((g: { location: string }) => g.location === "CAVE");
    expect(valley.count).toBe(4);
    expect(cave.count).toBe(2);
    expect(valley.scenes).toHaveLength(4);
    expect(valley.scenes[0]).toHaveProperty("id");
    expect(valley.scenes[0]).toHaveProperty("text");
    expect(valley.scenes[0]).toHaveProperty("page");
  });

  test("location param filters to one location, case-insensitively", async () => {
    const result = await handleGetLocations({ path: FIXTURE_PATH, location: "cave" });
    expect(result.isError).toBeFalsy();
    const entry = JSON.parse(result.content[0]!.text);
    expect(entry.location).toBe("CAVE");
    expect(entry.count).toBe(2);
  });

  test("an unknown location filter is a friendly message, not an error", async () => {
    const result = await handleGetLocations({ path: FIXTURE_PATH, location: "does-not-exist" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("no scenes found for location");
  });
});
