// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleFindPar } from "./find-par.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

/**
 * Joins every content part's text. The shared 4-slot document cache is process-wide, so a
 * success result may or may not be prefixed with a "[cache warning]" content part depending on
 * what other test files evicted first — asserting against content[0] alone would be flaky.
 */
function allText(result: { content: Array<{ text: string }> }): string {
  return result.content.map((c) => c.text).join("\n");
}

describe("find_par", () => {
  test("path and textContent are required", async () => {
    expect((await handleFindPar({ textContent: "x" })).isError).toBe(true);
    expect((await handleFindPar({ path: FIXTURE_PATH })).isError).toBe(true);
  });

  test("finds a paragraph containing the query, case-insensitively by default", async () => {
    const result = await handleFindPar({ path: FIXTURE_PATH, textContent: "romulan troop transport" });
    expect(result.isError).toBeFalsy();
    expect(allText(result)).toContain("Romulan troop transport");
  });

  test("case-sensitive search misses a differently-cased query", async () => {
    const result = await handleFindPar({
      path: FIXTURE_PATH,
      textContent: "ROMULAN TROOP TRANSPORT",
      caseSensitive: true,
    });
    expect(allText(result)).toContain("No paragraph found");
  });

  test("filters by paragraph type", async () => {
    const result = await handleFindPar({ path: FIXTURE_PATH, textContent: "Romulan", parType: "Character" });
    expect(result.isError).toBeFalsy();
    const text = result.content[result.content.length - 1]!.text;
    for (const line of text.split("\n---\n")) {
      expect(line.startsWith("[Character]")).toBe(true);
    }
  });

  test("no match reports a friendly message", async () => {
    const result = await handleFindPar({ path: FIXTURE_PATH, textContent: "zzz_no_such_text_zzz" });
    expect(allText(result)).toContain("No paragraph found");
  });

  test("unknown scene id errors", async () => {
    const result = await handleFindPar({ path: FIXTURE_PATH, textContent: "Romulan", id: "not-a-scene" });
    expect(result.isError).toBe(true);
    expect(allText(result)).toContain("section id not found");
  });
});

