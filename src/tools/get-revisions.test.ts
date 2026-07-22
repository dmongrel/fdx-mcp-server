// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetRevisions } from "./get-revisions.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

describe("get_revisions", () => {
  test("path is required", async () => {
    expect((await handleGetRevisions({})).isError).toBe(true);
  });

  test("returns the Revisions block as JSON", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetRevisions({ path: FIXTURE_PATH });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.activeSet).toBe("1");
    expect(Array.isArray(parsed.revision)).toBe(true);
    expect(parsed.revision.length).toBe(19);
    expect(parsed.revision[0].name).toBe("Blue Rev. (mm/dd/yy)");
  });
});

