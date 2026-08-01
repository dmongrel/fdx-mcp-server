// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSmarttypeTransitions } from "./get-smarttype-transitions.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

describe("get_smarttype_transitions", () => {
  test("path is required", async () => {
    expect((await handleGetSmarttypeTransitions({})).isError).toBe(true);
  });

  test("returns the Transitions SmartType list", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetSmarttypeTransitions({ path: FIXTURE_PATH });
    expect(result.content[0]!.text).toContain("CUT TO:");
    expect(result.content[0]!.text).toContain("FADE OUT.");
  });
});

