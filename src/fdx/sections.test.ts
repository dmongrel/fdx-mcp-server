// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { findContainingSectionIndex } from "./sections.ts";
import type { XmlElement } from "./xml.ts";

function par(type: string, id: string): XmlElement {
  return { type: "element", name: "Paragraph", attrs: [["Type", type], ["id", id]], children: [] };
}

describe("findContainingSectionIndex", () => {
  test("returns the index of the nearest preceding section-type paragraph", () => {
    const paragraphs = [
      par("Scene Heading", "scene-1"),
      par("Action", "action-1"),
      par("Dialogue", "dialogue-1"),
      par("Scene Heading", "scene-2"),
      par("Action", "action-2"),
    ];
    expect(findContainingSectionIndex(paragraphs, 2)).toBe(0);
    expect(findContainingSectionIndex(paragraphs, 4)).toBe(3);
  });

  test("a section-type paragraph itself is its own containing section", () => {
    const paragraphs = [par("Scene Heading", "scene-1"), par("Action", "action-1")];
    expect(findContainingSectionIndex(paragraphs, 0)).toBe(0);
  });

  test("returns -1 for a paragraph before any section heading", () => {
    const paragraphs = [par("Action", "preamble"), par("Scene Heading", "scene-1")];
    expect(findContainingSectionIndex(paragraphs, 0)).toBe(-1);
  });

  test("returns -1 for an empty document", () => {
    expect(findContainingSectionIndex([], 0)).toBe(-1);
  });
});
