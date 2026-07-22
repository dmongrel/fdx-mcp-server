// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSceneIntros } from "./get-scene-intros.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

describe("get_scene_intros", () => {
  test("path is required", async () => {
    expect((await handleGetSceneIntros({})).isError).toBe(true);
  });

  test("returns entries and the effective separator on a leading line", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetSceneIntros({ path: FIXTURE_PATH });
    const text = result.content[0]!.text;
    expect(text.split("\n")[0]).toBe('Separator: ". "');
    expect(text).toContain("INT");
    expect(text).toContain("I/E");
  });
});

