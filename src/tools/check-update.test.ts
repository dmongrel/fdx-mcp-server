// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { isNewer } from "./check-update.ts";

describe("isNewer", () => {
  test("detects newer remote version", () => {
    expect(isNewer("0.1.0", "1.0.0")).toBe(true);
    expect(isNewer("0.1.0", "0.2.0")).toBe(true);
    expect(isNewer("0.1.0", "0.1.1")).toBe(true);
  });

  test("rejects equal versions", () => {
    expect(isNewer("0.1.0", "0.1.0")).toBe(false);
    expect(isNewer("1.2.3", "1.2.3")).toBe(false);
  });

  test("rejects older remote version", () => {
    expect(isNewer("1.0.0", "0.9.9")).toBe(false);
    expect(isNewer("2.0.0", "1.99.99")).toBe(false);
  });

  test("handles versions with missing segments (pads to zero)", () => {
    // "1" → [1, 0, 0], "1.0.1" → [1, 0, 1]
    expect(isNewer("1", "1.0.1")).toBe(true);
    expect(isNewer("0.9", "0.9.1")).toBe(true);
  });

  test("handles major-only comparisons", () => {
    expect(isNewer("0", "1")).toBe(true);
    expect(isNewer("2", "1")).toBe(false);
  });
});

