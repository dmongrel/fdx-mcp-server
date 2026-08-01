// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSmarttypeSceneIntros } from "./get-smarttype-scene-intros.ts";
import { handleEditSmarttypeSceneIntros } from "./edit-smarttype-scene-intros.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-scene-intros-"));
  const path = join(dir, "script.fdx");
  copyFileSync(FIXTURE_PATH, path);
  return path;
}

describe("edit_smarttype_scene_intros", () => {
  test("create appends a new scene intro", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSmarttypeSceneIntros({ path, action: "create", value: "INT./EXT." });
    expect(result.isError).toBeFalsy();
    const after = await handleGetSmarttypeSceneIntros({ path });
    expect(after.content[0]!.text).toContain("INT./EXT.");
  });

  test("separator alone (no action) updates just the separator", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSmarttypeSceneIntros({ path, separator: " -- " });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("separator");
    const after = await handleGetSmarttypeSceneIntros({ path });
    expect(after.content[0]!.text.split("\n")[0]).toBe('Separator: " -- "');
  });

  test("action is required when no separator is provided", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSmarttypeSceneIntros({ path });
    expect(result.isError).toBe(true);
  });
});

