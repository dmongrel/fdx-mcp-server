import { describe, expect, test } from "bun:test";
import { handleCloseFdx } from "./close-fdx.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";

function blankDoc(): FdxDocument {
  return FdxDocument.parse('<?xml version="1.0"?><FinalDraft Version="6"></FinalDraft>');
}

describe("close_fdx", () => {
  test("reports nothing to close for an uncached path", () => {
    const result = handleCloseFdx({ path: "never-cached.fdx" });
    expect(result.content[0]!.text).toContain("nothing to close");
  });

  test("closes a clean cached document", () => {
    documentCache.set("close-clean.fdx", blankDoc());
    const result = handleCloseFdx({ path: "close-clean.fdx" });
    expect(result.content[0]!.text).toContain("Closed");
    expect(documentCache.get("close-clean.fdx")).toBeUndefined();
  });

  test("refuses a dirty document without force", () => {
    const doc = blankDoc();
    documentCache.set("close-dirty.fdx", doc);
    documentCache.touchDirty("close-dirty.fdx", doc);
    const result = handleCloseFdx({ path: "close-dirty.fdx" });
    expect(result.isError).toBe(true);
    expect(documentCache.get("close-dirty.fdx")).toBeDefined();
  });

  test("force closes a dirty document", () => {
    const doc = blankDoc();
    documentCache.set("close-dirty-force.fdx", doc);
    documentCache.touchDirty("close-dirty-force.fdx", doc);
    const result = handleCloseFdx({ path: "close-dirty-force.fdx", force: true });
    expect(result.content[0]!.text).toContain("discarded");
    expect(documentCache.get("close-dirty-force.fdx")).toBeUndefined();
  });
});
