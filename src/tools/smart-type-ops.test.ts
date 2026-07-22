// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { normalizeEntry, dedupList, sortListCI, applyCleanups, editSmartList, actionPastTense } from "./smart-type-ops.ts";

describe("smart-type-ops cleanups", () => {
  test("normalizeEntry trims whitespace and breaks", () => {
    expect(normalizeEntry("  \nDAY \t\n")).toBe("DAY");
  });

  test("dedupList is case-sensitive and keeps first occurrence", () => {
    expect(dedupList(["DAY", "day", "DAY", "Night"])).toEqual(["DAY", "day", "Night"]);
  });

  test("sortListCI sorts case-insensitively", () => {
    const list = ["banana", "Apple", "cherry"];
    sortListCI(list);
    expect(list).toEqual(["Apple", "banana", "cherry"]);
  });

  test("applyCleanups: fix + uppercase + dedup + sort", () => {
    const out = applyCleanups([" night ", "day", "DAY", "Dawn"], true, true);
    expect(out).toEqual(["DAWN", "DAY", "NIGHT"]);
  });
});

describe("editSmartList", () => {
  test("create appends and autosorts, trimming the value", () => {
    const result = editSmartList(["EXT", "INT"], { action: "create", value: "  I/E  " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.list).toEqual(["EXT", "I/E", "INT"]);
  });

  test("create rejects an empty value", () => {
    const result = editSmartList(["INT"], { action: "create", value: "   " });
    expect(result.ok).toBe(false);
  });

  test("edit is case-insensitive by default", () => {
    const result = editSmartList(["DAY", "NIGHT"], { action: "edit", find: "day", replace: "DUSK" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.list).toEqual(["DUSK", "NIGHT"]);
  });

  test("edit with cs=true misses a differently-cased find", () => {
    const result = editSmartList(["DAY"], { action: "edit", find: "day", replace: "X", cs: true });
    expect(result.ok).toBe(false);
  });

  test("edit rejects a blank replace", () => {
    const result = editSmartList(["DAY"], { action: "edit", find: "DAY", replace: "  " });
    expect(result.ok).toBe(false);
  });

  test("remove deletes the first match", () => {
    const result = editSmartList(["DAY", "NIGHT"], { action: "remove", find: "night" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.list).toEqual(["DAY"]);
  });

  test("remove fails when nothing matches", () => {
    const result = editSmartList(["DAY"], { action: "remove", find: "DUSK" });
    expect(result.ok).toBe(false);
  });

  test("fix cleans the list with no value change", () => {
    const result = editSmartList([" day ", "day", "NIGHT"], { action: "fix", dedup: true, uppercase: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.list).toEqual(["DAY", "NIGHT"]);
  });

  test("unknown action is rejected", () => {
    const result = editSmartList(["DAY"], { action: "bogus" });
    expect(result.ok).toBe(false);
  });
});

describe("actionPastTense", () => {
  test("known verbs", () => {
    expect(actionPastTense("create")).toBe("created");
    expect(actionPastTense("edit")).toBe("edited");
    expect(actionPastTense("remove")).toBe("removed");
  });

  test("unknown verb falls back to +d", () => {
    expect(actionPastTense("fix")).toBe("fixd");
  });
});

