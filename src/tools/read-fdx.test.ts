// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { documentCache } from "../fdx/cache.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("read_fdx", () => {
  test("rejects non-.fdx paths", async () => {
    const result = await handleReadFdx({ path: "foo.txt" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("only .fdx files");
  });

  test("requires a path", async () => {
    const result = await handleReadFdx(undefined);
    expect(result.isError).toBe(true);
  });

  test("reads and caches the fixture", async () => {
    const result = await handleReadFdx({ path: FIXTURE_PATH });
    expect(result.content[0]!.text).toContain("Successfully read FDX file");
    expect(documentCache.get(FIXTURE_PATH)).toBeDefined();
  });

  test("reports a read error for a missing file", async () => {
    const result = await handleReadFdx({ path: join(import.meta.dir, "does-not-exist.fdx") });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("read error");
  });
});

