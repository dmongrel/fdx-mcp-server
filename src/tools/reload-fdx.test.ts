// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReloadFdx } from "./reload-fdx.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("reload_fdx", () => {
  test("rejects non-.fdx paths", async () => {
    const result = await handleReloadFdx({ path: "foo.txt" });
    expect(result.isError).toBe(true);
  });

  test("re-reads and caches a document not previously cached", async () => {
    const result = await handleReloadFdx({ path: FIXTURE_PATH });
    expect(result.content[0]!.text).toContain("Reloaded");
    expect(documentCache.get(FIXTURE_PATH)).toBeDefined();
  });

  test("refuses to discard a dirty cached document without force", async () => {
    const doc = FdxDocument.parse('<?xml version="1.0"?><FinalDraft Version="6"></FinalDraft>');
    documentCache.set(FIXTURE_PATH, doc);
    documentCache.touchDirty(FIXTURE_PATH, doc);
    const result = await handleReloadFdx({ path: FIXTURE_PATH });
    expect(result.isError).toBe(true);
    expect(documentCache.get(FIXTURE_PATH)).toBe(doc);
  });

  test("force reloads and replaces a dirty cached document", async () => {
    const doc = FdxDocument.parse('<?xml version="1.0"?><FinalDraft Version="6"></FinalDraft>');
    documentCache.set(FIXTURE_PATH, doc);
    documentCache.touchDirty(FIXTURE_PATH, doc);
    const result = await handleReloadFdx({ path: FIXTURE_PATH, force: true });
    expect(result.content[0]!.text).toContain("discarded");
    expect(documentCache.get(FIXTURE_PATH)).not.toBe(doc);
  });
});

