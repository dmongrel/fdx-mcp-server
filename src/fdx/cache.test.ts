// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

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

  test("setSavepoint fails when nothing is cached for path", () => {
    const c = new LruCache();
    const result = c.setSavepoint("nope.fdx");
    expect(result).toEqual({ ok: false, reason: "nothing cached for path" });
  });

  test("rollback fails when nothing is cached for path", () => {
    const c = new LruCache();
    const result = c.rollback("nope.fdx");
    expect(result).toEqual({ ok: false, reason: "nothing cached for path" });
  });

  test("rollback fails when path has no savepoint", () => {
    const c = new LruCache();
    c.set("a.fdx", blankDoc());
    const result = c.rollback("a.fdx");
    expect(result).toEqual({ ok: false, reason: "no savepoint set for path" });
  });

  test("setSavepoint then rollback restores content and dirty flag", () => {
    const c = new LruCache();
    const doc = FdxDocument.parse(
      '<?xml version="1.0"?><FinalDraft Version="6"><Content><Paragraph Type="Action" id="p1"><Text>before</Text></Paragraph></Content></FinalDraft>',
    );
    c.set("a.fdx", doc);
    expect(c.setSavepoint("a.fdx")).toEqual({ ok: true });
    expect(c.hasSavepoint("a.fdx")).toBe(true);

    const mutated = c.get("a.fdx")!;
    c.touchDirty("a.fdx", mutated);
    const paragraph = mutated.getParagraphElements()[0]!;
    paragraph.children = [{ type: "element", name: "Text", attrs: [], children: [{ type: "text", value: "after" }] }];

    expect(c.get("a.fdx")!.serialize()).toContain("after");
    expect(c.entries()[0]!.dirty).toBe(true);

    expect(c.rollback("a.fdx")).toEqual({ ok: true });
    expect(c.get("a.fdx")!.serialize()).toContain("before");
    expect(c.get("a.fdx")!.serialize()).not.toContain("after");
    expect(c.entries()[0]!.dirty).toBe(false);
  });

  test("rollback is non-destructive — calling it twice restores the same state both times", () => {
    const c = new LruCache();
    const doc = FdxDocument.parse(
      '<?xml version="1.0"?><FinalDraft Version="6"><Content><Paragraph Type="Action" id="p1"><Text>saved</Text></Paragraph></Content></FinalDraft>',
    );
    c.set("a.fdx", doc);
    c.setSavepoint("a.fdx");
    c.rollback("a.fdx");
    const firstRollback = c.get("a.fdx")!.serialize();
    c.rollback("a.fdx");
    expect(c.get("a.fdx")!.serialize()).toBe(firstRollback);
  });

  test("a second setSavepoint overwrites the first", () => {
    const c = new LruCache();
    const doc = FdxDocument.parse(
      '<?xml version="1.0"?><FinalDraft Version="6"><Content><Paragraph Type="Action" id="p1"><Text>v1</Text></Paragraph></Content></FinalDraft>',
    );
    c.set("a.fdx", doc);
    c.setSavepoint("a.fdx"); // savepoint = v1

    const mutated = c.get("a.fdx")!;
    mutated.getParagraphElements()[0]!.children = [
      { type: "element", name: "Text", attrs: [], children: [{ type: "text", value: "v2" }] },
    ];
    c.setSavepoint("a.fdx"); // savepoint = v2, overwriting v1

    mutated.getParagraphElements()[0]!.children = [
      { type: "element", name: "Text", attrs: [], children: [{ type: "text", value: "v3" }] },
    ];
    c.rollback("a.fdx");
    expect(c.get("a.fdx")!.serialize()).toContain("v2");
  });

  test("hasSavepoint reflects presence/absence", () => {
    const c = new LruCache();
    c.set("a.fdx", blankDoc());
    expect(c.hasSavepoint("a.fdx")).toBe(false);
    c.setSavepoint("a.fdx");
    expect(c.hasSavepoint("a.fdx")).toBe(true);
  });

  test("entries() reports hasSavepoint per entry", () => {
    const c = new LruCache();
    c.set("a.fdx", blankDoc());
    c.set("b.fdx", blankDoc());
    c.setSavepoint("a.fdx");
    const entries = c.entries();
    expect(entries.find((e) => e.path === "a.fdx")!.hasSavepoint).toBe(true);
    expect(entries.find((e) => e.path === "b.fdx")!.hasSavepoint).toBe(false);
  });
});

