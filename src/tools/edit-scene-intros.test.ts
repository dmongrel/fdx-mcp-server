import { describe, expect, test } from "bun:test";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSceneIntros } from "./get-scene-intros.ts";
import { handleEditSceneIntros } from "./edit-scene-intros.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-scene-intros-"));
  const path = join(dir, "script.fdx");
  copyFileSync(FIXTURE_PATH, path);
  return path;
}

describe("edit_scene_intros", () => {
  test("create appends a new scene intro", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSceneIntros({ path, action: "create", value: "INT./EXT." });
    expect(result.isError).toBeFalsy();
    const after = await handleGetSceneIntros({ path });
    expect(after.content[0]!.text).toContain("INT./EXT.");
  });

  test("separator alone (no action) updates just the separator", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSceneIntros({ path, separator: " -- " });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("separator");
    const after = await handleGetSceneIntros({ path });
    expect(after.content[0]!.text.split("\n")[0]).toBe('Separator: " -- "');
  });

  test("action is required when no separator is provided", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSceneIntros({ path });
    expect(result.isError).toBe(true);
  });
});
