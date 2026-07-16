import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetMacroAliasList } from "./get-macro-alias-list.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("get_macro_alias_list", () => {
  test("path is required", async () => {
    expect((await handleGetMacroAliasList({})).isError).toBe(true);
  });

  test("lists macros with Alias and ActivateIn details", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetMacroAliasList({ path: FIXTURE_PATH });
    const text = result.content[0]!.text;
    expect(text).toContain('Element="Scene Heading" Name="INT"');
    expect(text).toContain("Alias:");
    expect(text).toContain("ActivateIn:");
  });

  test("errors for a nonexistent file", async () => {
    const result = await handleGetMacroAliasList({ path: join(import.meta.dir, "no-such-file.fdx") });
    expect(result.isError).toBe(true);
  });
});
