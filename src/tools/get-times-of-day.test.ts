// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetTimesOfDay } from "./get-times-of-day.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("get_times_of_day", () => {
  test("path is required", async () => {
    expect((await handleGetTimesOfDay({})).isError).toBe(true);
  });

  test("returns entries and the effective separator on a leading line", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetTimesOfDay({ path: FIXTURE_PATH });
    const text = result.content[0]!.text;
    expect(text.split("\n")[0]).toBe('Separator: " - "');
    expect(text).toContain("DAY");
    expect(text).toContain("NIGHT");
  });
});

