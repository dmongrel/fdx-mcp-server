// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetLocations } from "./get-locations.ts";
import { handleEditLocations } from "./edit-locations.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-locations-"));
  const path = join(dir, "script.fdx");
  copyFileSync(FIXTURE_PATH, path);
  return path;
}

describe("edit_locations", () => {
  test("create appends a new location", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditLocations({ path, action: "create", value: "SHUTTLE BAY" });
    expect(result.isError).toBeFalsy();
    const after = await handleGetLocations({ path });
    expect(after.content[0]!.text).toContain("SHUTTLE BAY");
  });

  test("remove deletes an existing location", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditLocations({ path, action: "remove", find: "vriha thrai" });
    expect(result.isError).toBeFalsy();
    const after = await handleGetLocations({ path });
    // The exact "VRIHA THRAI" entry is removed; longer entries like "VRIHA THRAI - BRIDGE" remain.
    expect(after.content[0]!.text.split("\n")).not.toContain("VRIHA THRAI");
    expect(after.content[0]!.text).toContain("VRIHA THRAI - BRIDGE");
  });
});

