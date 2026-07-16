import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetMacroAlias } from "./get-macro-alias.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("get_macro_alias", () => {
  test("path is required", async () => {
    expect((await handleGetMacroAlias({})).isError).toBe(true);
  });

  test("find by name", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetMacroAlias({ path: FIXTURE_PATH, name: "NIGHT" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain('Name="NIGHT"');
    expect(result.content[0]!.text).toContain('Element="Scene Heading"');
  });

  test("find by element and name", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetMacroAlias({ path: FIXTURE_PATH, element: "Transition", name: "CUTTO" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain('Name="CUTTO"');
  });

  test("find by shortcut", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetMacroAlias({ path: FIXTURE_PATH, shortcut: "Ctrl+Alt+5" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain('Name="NIGHT"');
  });

  test("no match returns a friendly message, not an error", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetMacroAlias({ path: FIXTURE_PATH, name: "NONEXISTENT_MACRO" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("No macro found");
  });

  test("missing all criteria is an error", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetMacroAlias({ path: FIXTURE_PATH });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("at least one");
  });

  test("find by text", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetMacroAlias({ path: FIXTURE_PATH, text: "INT. " });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain('Name="INT"');
  });

  test("case-insensitive element match", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetMacroAlias({ path: FIXTURE_PATH, element: "scene heading", name: "INT" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain('Name="INT"');
  });
});
