import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleGetPar } from "./get-par.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { readFileSync } from "node:fs";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");
const SCENE_HEADING_ID = "3c4f7ca7-60ba-4af1-bf97-19c7c36151c5";

/** See find-par.test.ts: the shared 4-slot cache may or may not prepend a warning content part. */
function allText(result: { content: Array<{ text: string }> }): string {
  return result.content.map((c) => c.text).join("\n");
}

describe("get_par", () => {
  test("path is required", async () => {
    const result = await handleGetPar({ id: "x" });
    expect(result.isError).toBe(true);
  });

  test("id is required", async () => {
    const result = await handleGetPar({ path: FIXTURE_PATH });
    expect(result.isError).toBe(true);
  });

  test("retrieves a paragraph by id", async () => {
    const result = await handleGetPar({ path: FIXTURE_PATH, id: SCENE_HEADING_ID });
    expect(result.isError).toBeFalsy();
    expect(allText(result)).toContain("EXT. SPACE, ON PLANET GIMAN-DOL IV");
  });

  test("errors on unknown id", async () => {
    const result = await handleGetPar({ path: FIXTURE_PATH, id: "does-not-exist" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
  });

  test("uses the cache when already loaded, bypassing disk", async () => {
    const path = join(import.meta.dir, "get-par-cache-fixture.fdx");
    const doc = FdxDocument.parse(readFileSync(FIXTURE_PATH, "utf-8"), path);
    documentCache.set(path, doc);
    const result = await handleGetPar({ path, id: SCENE_HEADING_ID });
    expect(result.isError).toBeFalsy();
  });
});
