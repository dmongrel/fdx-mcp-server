// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { contextRules, contextTools } from "./context-data.ts";

describe("context-data", () => {
  test("has 16 formatting rules", () => {
    expect(contextRules.length).toBe(16);
  });

  test("every rule has a non-empty title and content", () => {
    for (const rule of contextRules) {
      expect(rule.title.length).toBeGreaterThan(0);
      expect(rule.content.length).toBeGreaterThan(0);
    }
  });

  test("every tool has a unique, non-empty name and description", () => {
    const seen = new Set<string>();
    for (const tool of contextTools) {
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(seen.has(tool.name)).toBe(false);
      seen.add(tool.name);
    }
  });
});

