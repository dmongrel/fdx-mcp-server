import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetTagData } from "./get-tag-data.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("get_tag_data", () => {
  test("path is required", async () => {
    expect((await handleGetTagData({})).isError).toBe(true);
  });

  test("returns the TagData block as JSON", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetTagData({ path: FIXTURE_PATH });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(Array.isArray(parsed.tagCategories.tagCategory)).toBe(true);
    const names = parsed.tagCategories.tagCategory.map((c: any) => c.name);
    expect(names).toContain("Props");
    expect(names).toContain("Cast Members");
  });
});
