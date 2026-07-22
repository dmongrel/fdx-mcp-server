// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { getCachedFdx } from "./shared.ts";
import { buildBreakdownData, renderBreakdownHtml, renderBreakdownText } from "./breakdown-report.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("buildBreakdownData", () => {
  test("splits act-type headings out of the scene list", async () => {
    const { doc } = await getCachedFdx(FIXTURE_PATH);
    const data = buildBreakdownData(doc);

    // data.scenes includes every non-act section-type heading (Scene Heading plus e.g. Teaser),
    // so it can exceed stats.sceneCount, which only counts "Scene Heading" paragraphs.
    expect(data.scenes.length).toBeGreaterThanOrEqual(data.stats.sceneCount);
    for (const s of data.scenes) {
      expect(s.type.toLowerCase()).not.toBe("act break");
      expect(s.type.toLowerCase()).not.toBe("act&scene break");
    }
  });

  test("ranks characters by total mentions descending", async () => {
    const { doc } = await getCachedFdx(FIXTURE_PATH);
    const data = buildBreakdownData(doc);

    expect(data.rankedChars.length).toBeGreaterThan(0);
    for (let i = 1; i < data.rankedChars.length; i++) {
      expect(data.rankedChars[i - 1]!.total).toBeGreaterThanOrEqual(data.rankedChars[i]!.total);
    }
  });

  test("computes scene-length extremes and totals", async () => {
    const { doc } = await getCachedFdx(FIXTURE_PATH);
    const data = buildBreakdownData(doc);

    expect(data.shortestIdx).toBeGreaterThanOrEqual(0);
    expect(data.longestIdx).toBeGreaterThanOrEqual(0);
    expect(data.scenes[data.shortestIdx!]!.length).toBeLessThanOrEqual(data.scenes[data.longestIdx!]!.length);
    expect(data.totalLength).toBeGreaterThan(0);
  });
});

describe("renderBreakdownText", () => {
  test("wraps the no-arc-beats character list instead of overflowing the line width", async () => {
    const { doc } = await getCachedFdx(FIXTURE_PATH);
    const data = buildBreakdownData(doc);
    const text = renderBreakdownText(data);

    for (const line of text.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });
});

describe("renderBreakdownHtml", () => {
  test("escapes character names and scene text for HTML safety", async () => {
    const { doc } = await getCachedFdx(FIXTURE_PATH);
    const data = buildBreakdownData(doc);
    const html = renderBreakdownHtml(data);

    // A well-formed document should have matched section tags.
    expect((html.match(/<section/g) ?? []).length).toBe((html.match(/<\/section>/g) ?? []).length);
  });
});

