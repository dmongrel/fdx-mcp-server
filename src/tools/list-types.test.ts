// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { handleListTypes, knownType, isSectionType, listTypesText } from "./list-types.ts";

describe("list_types", () => {
  test("shows both classes, section before other, when no class given", () => {
    const out = listTypesText();
    const secIdx = out.indexOf("section:");
    const othIdx = out.indexOf("other:");
    expect(secIdx).toBeGreaterThanOrEqual(0);
    expect(othIdx).toBeGreaterThan(secIdx);
    expect(out).toContain("Scene Heading");
    expect(out).toContain("Shot");
    expect(out.indexOf("Shot")).toBeGreaterThan(othIdx);
  });

  test("alphabetizes within a class", () => {
    const out = listTypesText("other");
    expect(out.indexOf("Action")).toBeLessThan(out.indexOf("Cast List"));
  });

  test("class filter isolates section vs other", () => {
    const sec = listTypesText("section");
    expect(sec).not.toContain("Action");
    expect(sec).toContain("Scene Heading");

    const oth = listTypesText("other");
    expect(oth).not.toContain("Scene Heading");
    expect(oth).toContain("Action");
  });

  test("unknown class falls back to showing all", () => {
    const out = listTypesText("bogus");
    expect(out).toContain("section:");
    expect(out).toContain("other:");
  });

  test("knownType is case-insensitive and rejects unknowns", () => {
    for (const v of ["Scene Heading", "Action", "Shot", "Act&Scene Break"]) {
      expect(knownType(v)).toBe(true);
    }
    expect(knownType("scene heading")).toBe(true);
    for (const v of ["", "Made Up Type", "Sceen Heading"]) {
      expect(knownType(v)).toBe(false);
    }
  });

  test("isSectionType matches the section catalog only", () => {
    expect(isSectionType("Scene Heading")).toBe(true);
    expect(isSectionType("Action")).toBe(false);
  });

  test("handler returns the same text as listTypesText", () => {
    const result = handleListTypes({});
    expect(result.content[0]!.text).toBe(listTypesText());
  });
});

