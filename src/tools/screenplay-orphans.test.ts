// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * Unit tests for the pagination orphan rules in screenplay-pdf.ts, exercised directly against
 * hand-built LayoutItem arrays (bypassing FdxDocument/PDF rendering entirely) so page-boundary
 * placement can be pinned exactly via heightLines.
 */

import { describe, expect, test } from "bun:test";
import { resolveOrphanBreaks, simulateLayout, type LayoutItem } from "./screenplay-pdf.ts";

function block(type: string, heightLines: number, spaceBeforeLines = 1): LayoutItem {
  return {
    type,
    heightLines,
    block: { lines: new Array(heightLines).fill(""), spec: { leftIn: 1.5, rightIn: 7.5, alignment: "Left", spaceBeforeLines } },
  };
}

describe("resolveOrphanBreaks", () => {
  test("pulls the preceding Action onto a Transition's page rather than leaving it alone", () => {
    // Page 0: filler (52) + Transition doesn't fit (needs gap 2 + 1 = 3, 52+3=55 > 54) -> pushed
    // to a fresh page by itself, and the next huge Action can't join it either -> alone.
    const items: LayoutItem[] = [
      block("General", 1, 1), // index 0: small first-page anchor
      block("Action", 50, 1), // index 1: fills page 0 to exactly 52 lines used
      block("Transition", 1, 2), // index 2
      block("Action", 60, 1), // index 3: too big to share the Transition's page
    ];

    const unfixed = simulateLayout(items, new Set());
    expect(unfixed.pageOf[2]).not.toBe(unfixed.pageOf[1]); // Transition didn't fit with the Action before it...
    expect(unfixed.pageOf[2]).not.toBe(unfixed.pageOf[3]); // ...and nothing after it shares its page either: alone.

    const forced = resolveOrphanBreaks(items);
    const fixed = simulateLayout(items, forced);
    expect(fixed.pageOf[1]).toBe(fixed.pageOf[2]); // the preceding Action now shares the Transition's page
    expect(fixed.firstOnPage[2]).toBe(false); // Transition is no longer first (and thus not alone) on its page
  });

  test("leaves a Transition with room to spare untouched", () => {
    const items: LayoutItem[] = [block("Action", 10, 1), block("Transition", 1, 2), block("Action", 10, 1)];
    const forced = resolveOrphanBreaks(items);
    expect(forced.size).toBe(0);
  });

  test("does not touch a Transition that is genuinely the only paragraph in the document", () => {
    // Nothing before it to pull forward, so the rule can't apply.
    const items: LayoutItem[] = [block("Transition", 1, 2)];
    const forced = resolveOrphanBreaks(items);
    expect(forced.size).toBe(0);
  });

  for (const type of ["Scene Heading", "Character", "Act Break"]) {
    test(`moves a trailing ${type} to the top of the next page instead of orphaning it at the bottom`, () => {
      // index 0 fills the page to exactly 52 lines; index 1 (gap 1 + height 1 = 2) fits exactly
      // (52+2=54) as the LAST line on the page; index 2 is too big to follow it there.
      const items: LayoutItem[] = [block("Action", 52, 1), block(type, 1, 1), block("Action", 60, 1)];

      const unfixed = simulateLayout(items, new Set());
      expect(unfixed.pageOf[1]).toBe(unfixed.pageOf[0]); // starts out sharing page 0 with the Action before it...
      expect(unfixed.pageOf[2]).not.toBe(unfixed.pageOf[1]); // ...and is the last thing on that page: orphaned.

      const forced = resolveOrphanBreaks(items);
      const fixed = simulateLayout(items, forced);
      expect(fixed.pageOf[1]).not.toBe(fixed.pageOf[0]); // moved off the bottom of page 0...
      expect(fixed.firstOnPage[1]).toBe(true); // ...to the top of the next page instead
    });
  }

  test("leaves a Scene Heading alone at the bottom of a page it's the only thing on", () => {
    // If it's both first and last on its page, there's nothing to reflow around — not an orphan.
    const items: LayoutItem[] = [block("Scene Heading", 54, 1), block("Action", 5, 1)];
    const forced = resolveOrphanBreaks(items);
    expect(forced.size).toBe(0);
  });

  test("a Scene Heading followed by content on the same page is never touched", () => {
    const items: LayoutItem[] = [block("Scene Heading", 1, 1), block("Action", 5, 1)];
    const forced = resolveOrphanBreaks(items);
    expect(forced.size).toBe(0);
  });
});
