// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { handleSavepoint } from "./savepoint.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";

describe("savepoint", () => {
  test("path is required", () => {
    expect(handleSavepoint(undefined).isError).toBe(true);
  });

  test("errors when nothing is cached for path", () => {
    const result = handleSavepoint({ path: "not-cached.fdx" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("nothing cached for path");
  });

  test("captures a savepoint for a cached document", () => {
    const path = "savepoint-basic.fdx";
    documentCache.set(path, FdxDocument.parse('<?xml version="1.0"?><FinalDraft Version="6"></FinalDraft>'));
    const result = handleSavepoint({ path });
    expect(result.isError).toBeFalsy();
    expect(documentCache.hasSavepoint(path)).toBe(true);
  });
});
