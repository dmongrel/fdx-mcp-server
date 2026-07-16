import { describe, expect, test } from "bun:test";
import { LruCache, MAX_DOCUMENT_CACHE_SIZE } from "./cache.ts";
import { FdxDocument } from "./document.ts";

function blankDoc(): FdxDocument {
  return FdxDocument.parse('<?xml version="1.0"?><FinalDraft Version="6"></FinalDraft>');
}

describe("LruCache", () => {
  test("set marks entry clean", () => {
    const c = new LruCache();
    c.set("a.fdx", blankDoc());
    const entries = c.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.dirty).toBe(false);
  });

  test("touchDirty marks entry dirty", () => {
    const c = new LruCache();
    const doc = blankDoc();
    c.set("a.fdx", doc);
    c.touchDirty("a.fdx", doc);
    expect(c.entries()[0]!.dirty).toBe(true);
  });

  test("set after touchDirty clears dirty", () => {
    const c = new LruCache();
    const doc = blankDoc();
    c.set("a.fdx", doc);
    c.touchDirty("a.fdx", doc);
    c.set("a.fdx", doc);
    expect(c.entries()[0]!.dirty).toBe(false);
  });

  test("evicting a dirty entry returns a warning", () => {
    const c = new LruCache();
    const doc = blankDoc();
    const paths = Array.from({ length: MAX_DOCUMENT_CACHE_SIZE }, (_, i) => `d/${i}.fdx`);
    for (const p of paths) c.set(p, doc);
    c.touchDirty(paths[0]!, doc);
    for (const p of paths.slice(1)) c.get(p);

    const warning = c.set("new.fdx", doc);
    expect(warning).not.toBe("");
    expect(c.get(paths[0]!)).toBeUndefined();
  });

  test("evicting a clean entry is silent", () => {
    const c = new LruCache();
    const doc = blankDoc();
    for (let i = 0; i < MAX_DOCUMENT_CACHE_SIZE; i++) c.set(`d/${i}.fdx`, doc);
    expect(c.set("new.fdx", doc)).toBe("");
  });

  test("removeIf refuses a dirty entry without force", () => {
    const c = new LruCache();
    const doc = blankDoc();
    c.set("a.fdx", doc);
    c.touchDirty("a.fdx", doc);
    const result = c.removeIf("a.fdx", false);
    expect(result).toEqual({ existed: true, dirty: true, removed: false });
    expect(c.get("a.fdx")).toBeDefined();
  });

  test("removeIf force removes a dirty entry", () => {
    const c = new LruCache();
    const doc = blankDoc();
    c.set("a.fdx", doc);
    c.touchDirty("a.fdx", doc);
    const result = c.removeIf("a.fdx", true);
    expect(result).toEqual({ existed: true, dirty: true, removed: true });
    expect(c.get("a.fdx")).toBeUndefined();
  });

  test("removeIf on a missing path reports not-existed", () => {
    const c = new LruCache();
    expect(c.removeIf("nope.fdx", false)).toEqual({ existed: false, dirty: false, removed: false });
  });

  test("entries are ordered most-recently-used first", () => {
    const c = new LruCache();
    const doc = blankDoc();
    c.set("a.fdx", doc);
    c.set("b.fdx", doc);
    c.set("c.fdx", doc);
    c.get("a.fdx"); // move a back to the front
    expect(c.entries().map((e) => e.path)).toEqual(["a.fdx", "c.fdx", "b.fdx"]);
  });
});
