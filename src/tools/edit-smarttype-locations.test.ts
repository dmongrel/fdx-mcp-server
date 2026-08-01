// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSmarttypeLocations } from "./get-smarttype-locations.ts";
import { handleEditSmarttypeLocations } from "./edit-smarttype-locations.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-locations-"));
  const path = join(dir, "script.fdx");
  copyFileSync(FIXTURE_PATH, path);
  return path;
}

describe("edit_smarttype_locations", () => {
  test("create appends a new location", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSmarttypeLocations({ path, action: "create", value: "SHUTTLE BAY" });
    expect(result.isError).toBeFalsy();
    const after = await handleGetSmarttypeLocations({ path });
    expect(after.content[0]!.text).toContain("SHUTTLE BAY");
  });

  test("remove deletes an existing location", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSmarttypeLocations({ path, action: "remove", find: "cave" });
    expect(result.isError).toBeFalsy();
    const after = await handleGetSmarttypeLocations({ path });
    expect(after.content[0]!.text.split("\n")).not.toContain("CAVE");
    expect(after.content[0]!.text).toContain("PREHISTORIC VALLEY");
  });
});

