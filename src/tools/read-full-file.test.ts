// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFullFile } from "./read-full-file.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("read_full_file", () => {
  test("path is required", async () => {
    expect((await handleReadFullFile(undefined)).isError).toBe(true);
  });

  test("rejects non-.fdx paths", async () => {
    const result = await handleReadFullFile({ path: "script.txt" });
    expect(result.isError).toBe(true);
  });

  test("concatenates paragraph text, one per line", async () => {
    const result = await handleReadFullFile({ path: FIXTURE_PATH });
    expect(result.isError).toBeFalsy();
    // The shared 4-slot cache may prepend a "[cache warning]" content part; check every part.
    const text = result.content.map((c) => c.text).join("\n");
    expect(text).toContain("PROLOGUE");
    expect(text).toContain("Romulan troop transport");
  });
});

