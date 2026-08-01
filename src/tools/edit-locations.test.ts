// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetLocations } from "./get-locations.ts";
import { handleEditLocations } from "./edit-locations.ts";
import { handleGetSmarttypeLocations } from "./get-smarttype-locations.ts";
import { documentCache } from "../fdx/cache.ts";
import { getParagraphId, paragraphText } from "../fdx/paragraph.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-locations-"));
  const path = join(dir, "script.fdx");
  copyFileSync(FIXTURE_PATH, path);
  return path;
}

describe("edit_locations", () => {
  test("path, find, and replace are required", async () => {
    expect((await handleEditLocations({})).isError).toBe(true);
    expect((await handleEditLocations({ path: "x.fdx" })).isError).toBe(true);
    expect((await handleEditLocations({ path: "x.fdx", find: "CAVE" })).isError).toBe(true);
  });

  test("rejects a non-.fdx path", async () => {
    const result = await handleEditLocations({ path: "script.txt", find: "CAVE", replace: "CAVERN" });
    expect(result.isError).toBe(true);
  });

  test("renames every Scene Heading using that location, case-insensitively by default", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditLocations({ path, find: "cave", replace: "CAVERN" });
    expect(result.isError).toBeFalsy();
    expect(result.content.map((c) => c.text).join("\n")).toContain("Renamed 2 Scene Heading");

    const after = await handleGetLocations({ path });
    const groups = JSON.parse(after.content[0]!.text);
    expect(groups.find((g: { location: string }) => g.location === "CAVERN").count).toBe(2);
    expect(groups.find((g: { location: string }) => g.location === "CAVE")).toBeUndefined();
  });

  test("preserves the time-of-day suffix and intro token", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    await handleEditLocations({ path, find: "CAVE", replace: "CAVERN" });
    const doc = documentCache.get(path)!;
    const renamed = doc
      .getParagraphElements()
      .find((p) => getParagraphId(p) === "195fdc26-b72f-4291-9749-4c78b3042d10")!;
    expect(paragraphText(renamed)).toBe("INT. CAVERN - NIGHT");
  });

  test("adds the new name to the SmartType Locations list", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    await handleEditLocations({ path, find: "CAVE", replace: "CAVERN" });
    const smartList = await handleGetSmarttypeLocations({ path });
    expect(smartList.content.map((c) => c.text).join("\n")).toContain("CAVERN");
  });

  test("warns that the old name is now orphaned in the SmartType Locations list", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditLocations({ path, find: "CAVE", replace: "CAVERN" });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text).toContain("no longer used by any Scene Heading");
    expect(text).toContain("edit_smarttype_locations");
  });

  test("errors when the location isn't used anywhere", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditLocations({ path, find: "NO SUCH PLACE", replace: "SOMEWHERE" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("location not found");
  });
});
