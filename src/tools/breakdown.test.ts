// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { FdxDocument } from "../fdx/document.ts";
import { readTextFile } from "../fdx/runtime.ts";
import {
  parseSceneLength,
  parseSlugline,
  buildSceneIndex,
  buildScriptStats,
  buildPageMap,
  buildCharacterAppearances,
  rankCharacters,
  buildArcBeatData,
  getScenePropertiesById,
} from "./breakdown.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

async function loadFixture(): Promise<FdxDocument> {
  const source = await readTextFile(FIXTURE_PATH);
  const doc = FdxDocument.parse(source, FIXTURE_PATH);
  doc.dedupSmartTypeLists();
  return doc;
}

describe("parseSceneLength", () => {
  test("fraction only", () => expect(parseSceneLength("4/8")).toBe(0.5));
  test("whole + fraction", () => expect(parseSceneLength("1 4/8")).toBe(1.5));
  test("bare integer means eighths", () => expect(parseSceneLength("6")).toBe(0.75));
  test("empty is 0", () => expect(parseSceneLength("")).toBe(0));
  test("garbage is 0", () => expect(parseSceneLength("nope")).toBe(0));
});

describe("parseSlugline", () => {
  test("splits intro from location", async () => {
    const doc = await loadFixture();
    const { intro, location } = parseSlugline(doc, "INT. BRIDGE - VRIHA THRAI");
    expect(intro).toBe("INT");
    expect(location.length).toBeGreaterThan(0);
  });

  test("empty text yields empty parts", async () => {
    const doc = await loadFixture();
    expect(parseSlugline(doc, "   ")).toEqual({ intro: "", location: "", timeOfDay: "" });
  });

  test("matches a trailing TimeOfDay entry exactly", async () => {
    const doc = await loadFixture();
    const { intro, location, timeOfDay } = parseSlugline(doc, "INT. BRIDGE - DAY");
    expect(intro).toBe("INT");
    expect(timeOfDay).toBe("DAY");
    expect(location).toBe("BRIDGE -");
  });
});

describe("buildSceneIndex", () => {
  test("includes every Scene Heading with parsed metadata", async () => {
    const doc = await loadFixture();
    const scenes = buildSceneIndex(doc);
    expect(scenes.length).toBeGreaterThan(80);
    const first = scenes.find((s) => s.id === "3c4f7ca7-60ba-4af1-bf97-19c7c36151c5");
    expect(first).toBeDefined();
    expect(first!.type).toBe("Scene Heading");
    expect(first!.page).toBe(1);
    expect(first!.length).toBe(0.5);
    expect(first!.intro).toBe("EXT");
    expect(first!.text).toContain("GIMAN-DOL");
  });
});

describe("buildScriptStats", () => {
  test("computes totals across the whole document", async () => {
    const doc = await loadFixture();
    const stats = buildScriptStats(doc);
    expect(stats.paragraphCount).toBe(1755);
    expect(stats.sceneCount).toBe(89);
    expect(stats.totalPages).toBe(95);
    expect(stats.byType["Scene Heading"]).toBe(89);
  });
});

describe("buildPageMap", () => {
  test("covers every paragraph and ends at the last page", async () => {
    const doc = await loadFixture();
    const pageMap = buildPageMap(doc);
    expect(pageMap.length).toBeGreaterThan(0);
    expect(pageMap[0]!.startIndex).toBe(0);
    const last = pageMap[pageMap.length - 1]!;
    expect(last.endIndex).toBe(doc.getParagraphElements().length - 1);
    expect(last.page).toBe(95);
  });
});

describe("buildCharacterAppearances / rankCharacters", () => {
  test("counts scene mentions and ranks by total descending", async () => {
    const doc = await loadFixture();
    const appearances = buildCharacterAppearances(doc);
    expect(appearances.size).toBeGreaterThan(0);
    const ranked = rankCharacters(appearances);
    expect(ranked.length).toBe(appearances.size);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.total).toBeGreaterThanOrEqual(ranked[i]!.total);
    }
    // Every ranked total should equal the sum of that character's per-scene counts.
    for (const r of ranked) {
      const sum = appearances.get(r.name)!.reduce((s, a) => s + a.count, 0);
      expect(r.total).toBe(sum);
    }
  });
});

describe("buildArcBeatData", () => {
  test("only includes scenes with at least one beat", async () => {
    const doc = await loadFixture();
    const arcs = buildArcBeatData(doc);
    expect(arcs.length).toBeGreaterThan(0);
    for (const a of arcs) {
      expect(a.beats.length).toBeGreaterThan(0);
    }
    const talpekScene = arcs.find((a) => a.beats.some((b) => b.name === "TALPEK"));
    expect(talpekScene).toBeDefined();
  });
});

describe("getScenePropertiesById", () => {
  test("returns parsed properties for a known Scene Heading", async () => {
    const doc = await loadFixture();
    const result = getScenePropertiesById(doc, "3c4f7ca7-60ba-4af1-bf97-19c7c36151c5");
    expect(result).toBeTruthy();
    expect(result!.page).toBe(1);
    expect(result!.lengthEights).toBe(0.5);
    expect(result!.color).toBe("#C0C0C0C0C0C0");
  });

  test("returns null for an unknown id", async () => {
    const doc = await loadFixture();
    expect(getScenePropertiesById(doc, "nope")).toBeNull();
  });

  test("returns undefined for a paragraph with no SceneProperties", async () => {
    const doc = await loadFixture();
    // The Action paragraph right after the first Scene Heading has no SceneProperties.
    const result = getScenePropertiesById(doc, "bfcd8edf-24c1-4f38-9b48-4f5f8f06757c");
    expect(result).toBeUndefined();
  });
});

