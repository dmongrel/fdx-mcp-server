// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetPageMap } from "./get-page-map.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("get_page_map", () => {
  test("path is required", async () => {
    expect((await handleGetPageMap({})).isError).toBe(true);
  });

  test("returns a contiguous page map", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetPageMap({ path: FIXTURE_PATH });
    const pageMap = JSON.parse(result.content[0]!.text);
    expect(Array.isArray(pageMap)).toBe(true);
    expect(pageMap[0].startIndex).toBe(0);
    expect(pageMap[pageMap.length - 1].page).toBe(95);
  });
});

