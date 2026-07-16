import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetExtensions } from "./get-extensions.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("get_extensions", () => {
  test("path is required", async () => {
    expect((await handleGetExtensions({})).isError).toBe(true);
  });

  test("returns the Extensions SmartType list", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetExtensions({ path: FIXTURE_PATH });
    expect(result.content[0]!.text).toContain("(O.S.)");
    expect(result.content[0]!.text).toContain("(SUBTITLE)");
  });
});
