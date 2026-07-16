import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleSaveFdx } from "./save-fdx.ts";
import { bumpFilenameVersion } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("save_fdx", () => {
  test("bumpFilenameVersion increments or inserts _v#", () => {
    expect(bumpFilenameVersion("script.fdx")).toBe("script_v1.fdx");
    expect(bumpFilenameVersion("script_v1.fdx")).toBe("script_v2.fdx");
    expect(bumpFilenameVersion("script_v9.fdx")).toBe("script_v10.fdx");
    expect(bumpFilenameVersion("a/b/The Magic Hower.fdx")).toBe("a/b/The Magic Hower_v1.fdx");
  });

  test("errors when nothing is cached for the path", async () => {
    const result = await handleSaveFdx({ path: join(import.meta.dir, "never-read.fdx") });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("call read_fdx first");
  });

  test("saves the cached document with a bumped filename and updates the cache", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fdx-save-test-"));
    const path = join(dir, "script.fdx");
    await handleReadFdx({ path: FIXTURE_PATH });
    // Seed the cache under a fresh path so we don't mutate the shared fixture entry.
    const doc = documentCache.get(FIXTURE_PATH)!;
    documentCache.set(path, doc);

    const result = await handleSaveFdx({ path });
    const expectedTarget = join(dir, "script_v1.fdx");
    expect(result.content[0]!.text).toContain(expectedTarget);

    const written = readFileSync(expectedTarget, "utf-8");
    expect(written).toContain('Version="6"');
    expect(documentCache.get(expectedTarget)).toBeDefined();
  });

  test("version=false overwrites the exact path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fdx-save-test-"));
    const path = join(dir, "exact.fdx");
    await handleReadFdx({ path: FIXTURE_PATH });
    const doc = documentCache.get(FIXTURE_PATH)!;
    documentCache.set(path, doc);

    const result = await handleSaveFdx({ path, version: false });
    expect(result.content[0]!.text).toContain(path);
    expect(readFileSync(path, "utf-8")).toContain('Version="6"');
  });
});
