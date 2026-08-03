// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { skippedNestedWarning } from "./shared.ts";

describe("skippedNestedWarning", () => {
  test("returns empty string for a zero count", () => {
    expect(skippedNestedWarning(0)).toBe("");
  });

  test("formats a nonzero count", () => {
    expect(skippedNestedWarning(3)).toBe(
      "3 paragraph(s) nested inside a DualDialogue block were not scanned by this call.",
    );
  });

  test("formats a count of 1 without special-casing pluralization", () => {
    expect(skippedNestedWarning(1)).toBe(
      "1 paragraph(s) nested inside a DualDialogue block were not scanned by this call.",
    );
  });
});
