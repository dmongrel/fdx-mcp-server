import { describe, expect, test } from "bun:test";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetTimesOfDay } from "./get-times-of-day.ts";
import { handleEditTimesOfDay } from "./edit-times-of-day.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-times-of-day-"));
  const path = join(dir, "script.fdx");
  copyFileSync(FIXTURE_PATH, path);
  return path;
}

describe("edit_times_of_day", () => {
  test("create appends a new time of day", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditTimesOfDay({ path, action: "create", value: "DUSK" });
    expect(result.isError).toBeFalsy();
    const after = await handleGetTimesOfDay({ path });
    expect(after.content[0]!.text).toContain("DUSK");
  });

  test("edit + separator change together", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditTimesOfDay({
      path,
      action: "edit",
      find: "day",
      replace: "DAYTIME",
      separator: " / ",
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("Separator updated");
    const after = await handleGetTimesOfDay({ path });
    const text = after.content[0]!.text;
    expect(text.split("\n")[0]).toBe('Separator: " / "');
    expect(text).toContain("DAYTIME");
  });
});
