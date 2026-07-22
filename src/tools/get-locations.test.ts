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

  test("returns the Locations SmartType list", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetLocations({ path: FIXTURE_PATH });
    expect(result.content[0]!.text).toContain("CAVE");
    expect(result.content[0]!.text).toContain("PREHISTORIC VALLEY");
  });
});

