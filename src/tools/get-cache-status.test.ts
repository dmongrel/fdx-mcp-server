import { describe, expect, test } from "bun:test";
import { handleGetCacheStatus } from "./get-cache-status.ts";
import { documentCache, MAX_DOCUMENT_CACHE_SIZE } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";

describe("get_cache_status", () => {
  test("reports capacity and current entries as JSON", () => {
    documentCache.set(
      "status-test.fdx",
      FdxDocument.parse('<?xml version="1.0"?><FinalDraft Version="6"></FinalDraft>'),
    );
    const result = handleGetCacheStatus();
    const status = JSON.parse(result.content[0]!.text);
    expect(status.capacity).toBe(MAX_DOCUMENT_CACHE_SIZE);
    expect(status.entries.some((e: { path: string }) => e.path === "status-test.fdx")).toBe(true);
    expect(status.count).toBe(status.entries.length);
  });
});
